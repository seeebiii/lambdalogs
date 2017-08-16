#!/usr/bin/env node

const opts = require('minimist')(process.argv.slice(2));
const clc = require('cli-color');
const execSync = require('child_process').execSync;
const region = getAwsRegion();

const CF = require('aws-sdk/clients/cloudformation');
const cf = new CF({
    region: region
});
const LOGS = require('aws-sdk/clients/cloudwatchlogs');
const logs = new LOGS({
    region: region
});


if (!opts.stack || !opts.filter) {
    console.log(
        `Usage: lambda-logs --stack stackName --filter pattern [--region awsRegion] [--colorPattern pattern] [--color color] [--start timestamp] [--end timestamp] [--msgLength messageLength]`);
    return;
}

const context = {
    input: {
        stackName: opts.stack,
        filterPattern: opts.filter,
        colorPattern: opts.colorPattern || '',
        color: opts.color || 'yellow',
        startTime: getMsFromPastTimeString(opts.start) || Date.now() - 15 * 60 * 1000,
        endTime: getMsFromPastTimeString(opts.end) || Date.now(),
        msgLength: typeof opts.msgLength === 'number' ? opts.msgLength : 350
    },
    printedLogEvents: {}    // stores already printed log events, identified by log event id
};

if (opts.poll) {
    let delay = getMsFromTimeString(opts.poll);
    // delay is used for polling after the first request
    context.input.pollDelay = delay || 5000;
}

if (context.input.startTime >= context.input.endTime) {
    console.error(`Error: Start time '${opts.start}' may not be after end time '${opts.end}'! Please check your inputs.`);
    return;
}


prepare().then(logGroups => {
    let t = setTimeout(getAndPrintLogs(context.input.startTime, context.input.endTime), 100);

    function getAndPrintLogs(startTime, endTime) {
        return function() {
            // now find all log events of a log group filtered by the specified filter pattern
            let logEventPromises = [];
            logGroups.forEach(logGroupName => {
                logEventPromises.push(logs.filterLogEvents({
                    logGroupName: logGroupName,
                    startTime: startTime,
                    endTime: endTime,
                    filterPattern: context.input.filterPattern
                }).promise());
            });

            Promise.all(logEventPromises).then(logEvents => {
                // now retrieve the actual message and its timestamp
                let outputMessages = [];
                if (logEvents && logEvents.length) {
                    // console.log('logEvents: ', JSON.stringify(logEvents));
                    logEvents.forEach(logEvent => {
                        if (logEvent && logEvent.events) {
                            logEvent.events.forEach(event => {
                                // store events
                                if (!context.printedLogEvents[event.eventId]) {
                                    let printEvent = {
                                        timestamp: event.timestamp,
                                        message: event.message.trim()
                                    };
                                    outputMessages.push(printEvent);
                                    context.printedLogEvents[event.eventId] = printEvent;
                                }
                            });
                        }
                    });
                }
                return outputMessages;
            }).then(outputMessages => {
                // use the timestamp to sort the messages in the right order
                return outputMessages.sort((a, b) => {
                    if (a.timestamp && b.timestamp) {
                        return a.timestamp - b.timestamp;
                    } else {
                        return 0;
                    }
                });
            }).then(printSortedMessages).then(() => {
                // if user wants to stream the logs, we have to request the log events again..
                if (opts.poll) {
                    // Sometimes it takes some time until the logs reach CloudWatch, so it might be that logs belong to the time frame of the
                    // previous iteration/request, but we didn't get them, because it took some time for them to be available in CloudWatch;
                    // so keep it simple and just add a small buffer, that should do the trick
                    let newStart = endTime - 10000;
                    let newEnd = Date.now();
                    t = setTimeout(getAndPrintLogs(newStart, newEnd), context.input.pollDelay);
                }
            }).catch(err => {
                console.log('Error: ', err);
            });
        };
    }
}).catch(err => {
    console.log('An unexpected error occurred while retrieving Lambda logs: ', err);
});


function prepare() {
    // get all resources of the stack
    return cf.listStackResources({
        StackName: context.input.stackName
    }).promise().then(data => {
        // filter out Lambdas from resources and retrieve their physical resource id's
        const resources = data.StackResourceSummaries;

        if (!resources) {
            throw new Error('No resources available in stack.');
        }

        let lambdaFunctions = resources.filter(elem => {
            return elem.ResourceType === 'AWS::Lambda::Function';
        });

        return lambdaFunctions.map(elem => {
            return elem.PhysicalResourceId;
        });
    }).then(resourceIds => {
        // now find all log groups related to the Lambdas
        let logPromises = [];
        resourceIds.forEach(resourceId => {
            logPromises.push(logs.describeLogGroups({
                logGroupNamePrefix: '/aws/lambda/' + resourceId
            }).promise());
        });
        return Promise.all(logPromises);
    }).then(logGroups => {
        // now filter out all non-existent log groups
        let resultLogGroups = [];
        logGroups.forEach(elem => {
            if (elem.logGroups.length) {
                elem.logGroups.forEach(logGroup => {
                    resultLogGroups.push(logGroup.logGroupName);
                });
            }
        });
        return resultLogGroups;
    });
}


function printSortedMessages(sortedMessages) {
    if (sortedMessages && sortedMessages.length) {
        sortedMessages.forEach(msg => {
            let messageString = msg.message;
            let beginning = '';

            if (context.input.colorPattern === '') {
                beginning = new Date(msg.timestamp);
            } else {
                let regex = new RegExp(context.input.colorPattern);
                let match = messageString.match(regex);
                let end = match.index + match[0].length;
                beginning = messageString.substring(0, end);
                messageString = messageString.substring(end + 1);
            }

            if (context.input.msgLength > 0) {
                messageString = messageString.substring(0, context.input.msgLength);
            }

            console.log(getColoredClc()(beginning) + ' ' + messageString);
        });
    }
}


/**
 * Gets the AWS region to use for further calls. It's accessing the region configured in AWS CLI if no region parameter was set when
 * calling this CLI tool. Default: 'us-east-1'
 * @returns {string} an AWS region
 */
function getAwsRegion() {
    return opts.region || execSync('aws configure get region').toString().trim() || 'us-east-1';
}


/**
 * Converts time strings like '10s', '20m', '30h' or '4w' into milliseconds.
 * @param timeString
 * @returns {number} milliseconds of the given timeString
 */
function getMsFromPastTimeString(timeString) {
    if (!timeString) {
        return 0;
    }

    return Date.now() - getMsFromTimeString(timeString);
}


function getMsFromTimeString(timeString) {
    return getFactor(timeString) * getUnitInMs(getUnitName(timeString));
}


function getFactor(timeString) {
    timeString = timeString.trim();
    return parseInt(timeString.substring(0, timeString.length));
}


function getUnitName(timeString) {
    timeString = timeString.trim();
    return timeString.charAt(timeString.length - 1);
}


function getUnitInMs(name) {
    const ms = 1000;

    switch (name) {
        case 's':
            return ms;
        case 'm':
            return ms * 60;
        case 'h':
            return ms * 60 * 60;
        case 'd':
            return ms * 60 * 60 * 24;
        case 'w':
            return ms * 60 * 60 * 24 * 7;
    }
}


function getColoredClc() {
    let coloredClc = clc.yellow;
    if (clc[context.input.color]) {
        coloredClc = clc[context.input.color];
    }
    return coloredClc;
}