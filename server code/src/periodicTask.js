var cron = require('node-cron');

var log4js = require('log4js');
log4js.configure('./configure/log4js.json');
var operation_log = log4js.getLogger("operation");
var error_log = log4js.getLogger("error");
var interim_log = log4js.getLogger("interim");

var redisPool = require('./caching.js');
var dbPool = require('./db.js');
var util = require('./util.js');
var config = require('./configs.js');

cron.schedule('53 * * * *', function () {
  //logger.log('info', 'running a task every minute / ' + new Date());
  job.setUserContents();
}).start();

var job = {
  setUserContents : function () {
    var EACH_DATA_SIZE = 96;
    //해당 클라우드로 접속하는 사용자 리스트 알아야 한다 <-- DB에 쿼리 날려보면 됨, select * from newyork; 이런식?

    //2.
      //모든 사용자에 대해서 해야함.
      //각 사용자들에게 할당되어 있는 메모리 사이즈를 가지고 옴

      /*
      //만약에 각 데이터의 사이즈가 정해져있다면
      //자신에게 할당되어 있는 메모리 사이즈를 넘지 않는 최대 개수 만큼 데이터를 가지고 온다
        //레디스의 lrange 로 개수 만큼 인덱스를 가져와서
        //그 인덱스가 DB에서도 ID 값이니까 그걸로 데이터를 불러서 set 한다.
      */
    var serverLocation;
    var userList = [];
    var userMaxNumData = [];
    var usersContentIndexList = [];
    var usersDataList = [];

    var current_hour;
    var usage_sum;
    var usersMemory = [];
    var serverLocation;

    var MAX_MEMORY = config.totalMemory;

    var promise = new Promise(function(resolved, rejected){
      redisPool.flushDataMemory();
      redisPool.flushSocialMemory();
      resolved();
    });

    promise
    .then(function(result){
      return new Promise(function(resolved, rejected){
        //이때 현재 서버의 IP에 따라 어떤 테이블의 내용을 넣을지 결정해야한다.
        //예를들어, newyork에 있는 서버라면, newyork 테이블의 내용을 가져와야함.
        serverLocation = util.getServerLocation();
        resolved();
      })
    }, function(err){
        console.log(err);
    })

    //현재 시각 불러오기
    .then(function(){
      return new Promise(function(resolved, rejected){
        var NT_date = new Date();
        current_hour = NT_date.getHours();  //현재 시각
        resolved();
      })
    }, function(err){
        console.log(err);
    })

    //다음 시간에 모든 사용자 사용량의 합 구하기
    .then(function(){
      return new Promise(function(resolved, rejected){
        dbPool.getConnection(function(err, conn) {
            var next_hour = current_hour + 1; // 다음 시간의 사용량을 보고, 미리 캐싱하는 것이므로
            var query_stmt = 'SELECT SUM(B.' + next_hour + 'h) AS usage_sum ' +
                             'FROM ' + serverLocation + ' A JOIN user_usage B ' +
                             'ON A.userId = B.userId';
            //console.log(query_stmt);
            conn.query(query_stmt, function(err, rows) {
                if(err) {
                   error_log.info("fail to get the sum of user usages : " + err);
                   error_log.info("query statement : " + query_stmt);
                   rejected("DB err!");
                }
                if(rows.length != 0){
                  usage_sum = rows[0].usage_sum;
                  conn.release(); //MySQL connection release
                  resolved();
                } else {
                  console.log("rows.length == 0")
                }
            })
        });
      })
    }, function(err){
        console.log(err);
    })

    //다음 시간에 각 사용자의 사용량 리스트 구하기
    .then(function(){
      return new Promise(function(resolved, rejected){
        dbPool.getConnection(function(err, conn) {
            var next_hour = current_hour + 1; // 다음 시간의 사용량을 보고, 미리 캐싱하는 것이므로
            var query_stmt = 'SELECT A.userId, B.' + next_hour + 'h as eachUsage' + ' ' +
                             'FROM ' + serverLocation + ' A JOIN user_usage B ' +
                             'ON A.userId = B.userId';
            //console.log(query_stmt);
            conn.query(query_stmt, function(err, rows) {
                if(err) {
                   error_log.info("fail to get user usage : " + err);
                   error_log.info("query statement : " + query_stmt);
                   rejected("DB err!");
                }
                for (var i=0; i<rows.length; i++) {
                  var portion =  rows[i].eachUsage / usage_sum;
                  var userMemory = MAX_MEMORY * portion;
                  //operation_log.info("USER ID = " + rows[i].userId + ", PORTION = " + portion + ", MEMORY SIZE = " + userMemory);

                  usersMemory.push({
                      userId : rows[i].userId,
                      userPortion : portion,
                      userMemory : userMemory
                  });
                }
                conn.release(); //MySQL connection release
                resolved();
            })
        });
      })
    }, function(err){
        console.log(err);
    })

    //Redis에 각 사용자 메모리 사이즈 Set
    .then(function(){
      return new Promise(function(resolved, rejected){
        var setSocialMemoryInRedis = function(i, callback){
          if(i >= usersMemory.length){
            callback();
          } else {
            //key는 사용자 ID 이고, value는 전체 메모리 양 * portion
            var key = usersMemory[i].userId;
            var value = usersMemory[i].userMemory;
            redisPool.socialMemory.set(key, value, function (err) {
                if(err) rejected("fail to initialize the social memory in Redis");
                //console.log("["+ i +"] key : " + key + ", value : " + value);
                operation_log.info("["+ i +"] key (User ID) : " + key + ", value (Memory Size) : " + value);
                setSocialMemoryInRedis(i+1, callback);
            });
          }
        }

        setSocialMemoryInRedis(0, function(){
          resolved();
          setSocialMemoryInRedis = null;
        })
      })
    }, function(err){
        console.log(err);
    })


    .then(function(result){
      return new Promise(function(resolved, rejected){
        serverLocation = util.getServerLocation();
        resolved();
      })
    }, function(err){
        console.log(err);
    })

    .then(function(){
      return new Promise(function(resolved, rejected){
        dbPool.getConnection(function(err, conn) {
            var query_stmt = 'SELECT userId ' +
                             'FROM ' + serverLocation;
            conn.query(query_stmt, function(err, rows) {
                if(err) {
                   error_log.info("fail to get the user list from MySQL : " + err);
                   error_log.info("query statement : " + query_stmt);
                   rejected("DB err!");
                }
                for (var i=0; i<rows.length; i++) {
                  userList.push({
                      userId : rows[i].userId
                  });
                }
                conn.release(); //MySQL connection release
                resolved();
            })
        });
      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        var getUserMemorySize = function(i, callback){
          if(i >= userList.length){
            callback();
          } else {
            var key = userList[i].userId;
            redisPool.socialMemory.get(key, function (err, result) {
                if(err){
                  error_log.info("fail to get the user memory size from redis! : " + err );
                  error_log.info("key (userId) = " + key);
                  error_log.info();
                  rejected("fail to get the user memory size from redis! ");
                }
                if(result){
                  var maxNumData = parseInt(result / EACH_DATA_SIZE);
                  userMaxNumData.push({
                    userId : key,
                    numData : maxNumData
                  });
                  getUserMemorySize(i+1, callback);

                } else {
                  getUserMemorySize(i+1, callback);
                }
              });
            }
          };

          getUserMemorySize(0, function(){
            resolved();
            getUserMemorySize = null;
          })
      })
    }, function(err){
        console.log(err);
    })

    .then(function(){
      return new Promise(function(resolved, rejected){
        var getDataIndexes = function(i, callback){
          if(i >= userMaxNumData.length){
            callback();
          } else {

            var key = userMaxNumData[i].userId;
            var start = 0;
            var end = userMaxNumData[i].numData - 1; // 데이터 인덱스가 0부터 시작하므로
            redisPool.indexMemory.lrange(key, start, end, function (err, result) {
                if(err){
                  error_log.info("fail to get the index memory in Redis : " + err);
                  error_log.info("key (req.params.userId) : " + key + ", start : " + start + ", end : " + end);
                  error_log.info();
                  rejected("fail to get the index memory in Redis");
                }

                usersContentIndexList.push({
                  userId : key,
                  indexList : result
                });
                getDataIndexes(i+1, callback);
            });

          }
        };

        getDataIndexes(0, function(){
          resolved();
          getDataIndexes = null;
        })
      })
    }, function(err){
        console.log(err);
    })

    .then(function(){
      return new Promise(function(resolved, rejected){
        //console.log(usersContentIndexList);
        var getDataFromDB = function(i, callback){
          if(i >= usersContentIndexList.length){
            callback();
          } else {

            //----------------------------------------------------------------//
            dbPool.getConnection(function(err, conn) {

              var query_stmt = 'SELECT B.userId, A.id, A.message ' +
                               'FROM content A ' +
                               'JOIN user B ' +
                               'ON A.uid = B.id ' +
                               'WHERE B.userId = "' + usersContentIndexList[i].userId + '" ';

              var additionalQueryString = "";
              for(var j=0; j<usersContentIndexList[i].indexList.length; j++){
                  additionalQueryString += function(idx) {

                          if (idx == 0 && idx == usersContentIndexList[i].indexList.length - 1){
                              return 'AND (A.id = ' + usersContentIndexList[i].indexList[idx] + ')';

                          } else if(idx == 0 && idx != usersContentIndexList[i].indexList.length - 1){
                              return 'AND (A.id = ' + usersContentIndexList[i].indexList[idx];

                          } else if (idx != 0 && idx != usersContentIndexList[i].indexList.length - 1){
                              return ' OR A.id = ' + usersContentIndexList[i].indexList[idx];

                          } else if (idx != 0 && idx == usersContentIndexList[i].indexList.length - 1) {
                              return ' OR A.id = ' + usersContentIndexList[i].indexList[idx] + ')';
                          }

                  }(j);
              }

              query_stmt += additionalQueryString;

              conn.query(query_stmt, function(err, result) {
                  if(err){
                    error_log.info("fail to get user contents from MySQL! : " + err);
                    error_log.info("query statement : " + query_stmt);
                    conn.release(); //MySQL connection release
                    rejected("fail to get user contents from MySQL!");
                  }
                  else if(result == undefined || result == null){
                    error_log.info("fail to get user contents from MySQL! : There is no result.");
                    error_log.info("query statement : " + query_stmt);
                    conn.release(); //MySQL connection release
                    rejected("fail to get user location from MySQL!");
                  }
                  else {
                    for (var k=0; k<result.length; k++) {
                      usersDataList.push({
                          userId : result[k].userId,
                          contentId : result[k].id,
                          message : result[k].message
                      });
                    }
                    conn.release(); //MySQL connection release
                    getDataFromDB(i+1, callback);
                  }
              })
            });
            //----------------------------------------------------------------//

          }
        };

        getDataFromDB(0, function(){
          resolved();
          getDataFromDB = null;
        })
      })
    }, function(err){
        console.log(err);
    })
    .then(function(contentIndexList){
      return new Promise(function(resolved, rejected){

        var setDataIntoMemory = function(i, callback){
          if(i >= usersDataList.length){
            callback();
          } else {

            var key = usersDataList[i].contentId;
            var value = usersDataList[i].message;
            redisPool.dataMemory.set(key, value, function (err) {
                if(err){
                  error_log.info("fail to push the content into friend's data memory in Redis : " + err);
                  error_log.info("key (tweetObject.contentId) : " + key + ", value (tweetObject.content) : " + value);
                  error_log.info();
                }
            });
            setDataIntoMemory(i+1, callback);

          }
        };

        setDataIntoMemory(0, function(){
          resolved();
          setDataIntoMemory = null;
        })

      })
    }, function(err){
        console.log(err);
    })
    .then(function(){
      return new Promise(function(resolved, rejected){
        console.log("setting data in data memory was completed")
        resolved();
        //cb();
      })
    }, function(err){
        console.log(err);
    })

    /*
    //만약에 각 데이터의 사이즈가 안정해져있다면
    //자신에게 할당되어 있는 메모리 사이즈를 넘지 않는 최대 개수 만큼 데이터를 가지고 온다
      //레디스의 lrange 로 개수 만큼 인덱스를 가져와서
      //그 인덱스가 DB에서도 ID 값이니까 그걸로 데이터를 불러서 set 한다.
    */
  }
}

module.exports = job;