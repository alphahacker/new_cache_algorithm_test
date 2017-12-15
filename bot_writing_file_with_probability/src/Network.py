import urllib
import urllib2
import json
import random
import time

from MsgSets import *
from Log import *

class DBPS:
    dbPoolServerIPAddress = "165.132.104.211"

    def __init__(self):
        pass

    def getUserInfoList(self, botNumber, botTotal):
        url = "http://" + DBPS.dbPoolServerIPAddress + "/dbcp/userInfoList/botNum/" + botNumber + "/botTotal/" + botTotal
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        #print parsedJsonData["userInfoList"]

        userList = parsedJsonData["userInfoList"]
        return userList

    def getUserTweetList(self, userId):
        url = "http://" + DBPS.dbPoolServerIPAddress + "/dbcp/tweetTime/" + userId
        #print url
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        tweetList = parsedJsonData["tweetList"]

        return tweetList

    def getDstLocation(self, userLocation):
        url = "http://" + DBPS.dbPoolServerIPAddress + "/dbcp/serverLocation/" + userLocation
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        dstLocation = parsedJsonData["surrogateLocation"]

        return dstLocation

    def getCoord(self, userLocation):
        url = "http://" + DBPS.dbPoolServerIPAddress + "/dbcp/coord/" + userLocation
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        lat = parsedJsonData["latitude"]
        lng = parsedJsonData["longitude"]

        return lat, lng


class Surrogate:
    def __init__(self):
        self.surrogateIp = ""
        self.userId = ""

    def commWithSurrogate(self, surrogateIp, userId, nTotalOperation):
        self.surrogateIp = surrogateIp
        self.userId = userId

        for i in range(0, nTotalOperation):
            self.writeOperation()
            delay = random.randrange(1, 6)
            time.sleep(delay / 10)

        self.readOperation()

    def writeOperation(self):
        url = "http://" + self.surrogateIp + "/timeline/" + self.userId
        value = getWriteMsgToSend(0)

        data = urllib.urlencode(value)
        req = urllib2.Request(url, data)
        response = urllib2.urlopen(req)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        if parsedJsonData["status"] == 'OK':
            Log.info("WRITE operation : USER ID = " + self.userId)
        else:
            Log.info("ERROR ! fail to communicate with surrogate server [WriteOperation][POST][" + url + "]")

    def readOperation(self):
        url = "http://" + self.surrogateIp + "/timeline/" + self.userId
        response = urllib2.urlopen(url)
        resultData = response.read()
        parsedJsonData = json.loads(resultData)

        if parsedJsonData["status"] == 'OK':
            Log.info("READ operation : USER ID = " + self.userId)
        else:
            Log.info("ERROR ! fail to communicate with surrogate server [ReadOperation][GET][" + url + "]")

