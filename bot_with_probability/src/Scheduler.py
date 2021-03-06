from Structure import JobList
from Timer import *
from JsonTools import *
from Pattern import *
from MsgSets import *
from Network import *
from math import sin, cos, sqrt, atan2, radians
#from Recorder import *
import time
import os
import socket
import sys
import pdb

class Scheduler:
    ONE_MINUTE = 60

    def __init__(self, userID, userPlace):
        self.jobHashMap = JobHashMap()
        self.patternDelegator = PatternDelegator(userID)
        self.userID = userID
        self.userPlace = userPlace
        self.continued = True
        self.firstStep = True
        self.oneDayCounter = 0

    def start(self):
        from Log import *
        Log.debug("Start scheduler")

        timer = Timer()
        timer.setCurrentDateAndTime()

        processID = os.getpid()
        Log.debug("Start to operate bot [" + str(processID) + "]\n")

        #Make a pattern
        self.patternDelegator.startToGetPattern(self.jobHashMap)

        #for i in range(0, 24):
         #   print('JobHash[%d] = %d' % (i, self.jobHashMap.dequeJobValueByKey(i)))

        Log.debug("=============================================")
        Log.debug("=================== Ready ===================")
        Log.debug("=============================================")

        Log.debug("Getting a target surrogate server IP address \n")
        dstIPAddress = self.getDestinationSurrogateIP(self.userPlace)


        while self.continued:
            try:
                start = self.checkNextHour(timer)

                # After generating the pattern
                # Send the report to the manager
                # and wait for the start message
                if self.firstStep:
                    # Log.debug("Send the action message to the manager\n")
                    # reportToSend = makeManagerJsonData(self.userID)
                    # recvMsgFromManager = self.networkingWithManager(reportToSend)
                    self.firstStep = False

                # if len(recvMsgFromManager) == 0:
                #	Log.error("Fail to receive the action message from the manager")
                #	self.continued = False
                #	continue

                if start:
                    Log.debug("=============================================")
                    Log.debug("=================== Start ===================")
                    Log.debug("=============================================")

                currentHour = timer.getCurrentHour()

                while start:
                    nextJobToWork = self.jobHashMap.dequeJobValueByKey(currentHour)

                    if nextJobToWork == 0:
                        start = False
                        Log.debug("Complete sending requests")
                        break

                    delay = random.randrange(1, 6)
                    time.sleep(delay)

                    print nextJobToWork
                    print dstIPAddress

                    Log.debug("Start to communicate with server \n")
                    if dstIPAddress:
                        self.startToCommunicateWithService(nextJobToWork, dstIPAddress)

                if not self.continued:
                    break

                Log.debug("Wait for next hour\n")
                wait = timer.getWaitTimeForNextHour()
                time.sleep(wait)
                timer.setCurrentDateAndTime()
            except Exception as e:
                Log.error("There is error in scheduler")
                Log.error(e)
                sys.exit(1)

        Log.debug("Successfully end the one day job")
        sys.exit(0)


    def checkNextHour(self, timer):
        if self.firstStep == True:
            return True

        if self.oneDayCounter == 24:
            self.continued = False
            return False

        self.oneDayCounter += 1
        return True

    def getDestinationSurrogateIP(self, userLocation):
        print("User Location = %s " % userLocation)
        DBPSServer = DBPS()
        #dstLocation = DBPSServer.getDstLocation(userLocation)
        #print("Destination Location = %s " % dstLocation)
        userLat, userLng = DBPSServer.getCoord(userLocation)
        dstLocation = self.getMinLocation(userLat, userLng)

        print("Destination (closest) server location = " + dstLocation)

        surrogateIp = ''

        if dstLocation == 'newyork':
            surrogateIp = '165.132.104.210'
        elif dstLocation == 'texas':
            surrogateIp = '165.132.104.208'
        elif dstLocation == 'washington':
            surrogateIp = '165.132.104.209'
        else:
            print "Wrong destination surrogate location!"
            Log.error("Wrong destination surrogate location!")

        print("Surrogate IP address = %s " % surrogateIp)

        return surrogateIp


    def getDistance(self, _lat1, _lng1, _lat2, _lng2):
        # approximate radius of earth in km
        R = 6373.0

        lat1 = radians(_lat1)
        lng1 = radians(_lng1)
        lat2 = radians(_lat2)
        lng2 = radians(_lng2)

        dlng = lng2 - lng1
        dlat = lat2 - lat1

        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        distance = R * c

        print("Distance = ", distance)

        return distance

    def getMinLocation(self, userLat, userLng):
        closestLocation = ""

        distance = self.getDistance(userLat, userLng, 40.7127837, -74.0059413) #newyork
        minDist = distance
        closestLocation = "newyork"

        distance = self.getDistance(userLat, userLng, 31.9685988, -99.9018131)  #texas
        if minDist > distance :
            minDist = distance
            closestLocation = "texas"

        distance = self.getDistance(userLat, userLng, 47.781574, -120.740139)  #washington
        if minDist > distance :
            minDist = distance
            closestLocation = "washington"

        return closestLocation

    # 2. communicate with Server
    def startToCommunicateWithService(self, nextJobToWork, dstIPAddress):
        Log.debug("Start to send data to Surrogate Server")
        nTotalOperation = nextJobToWork
        Log.debug("The number of operation at this time = ")
        Log.debug(nTotalOperation)
        surrogate = Surrogate()

        surrogate.commWithSurrogate(dstIPAddress, self.userID, nTotalOperation)

        '''
        for i in range(0, nTotalOperation):
            surrogate.commWithSurrogate(dstIPAddress, self.userID)
            delay = random.randrange(1, 6)
            time.sleep(delay / 10)
        '''