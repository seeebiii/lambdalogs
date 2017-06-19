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


let stackName = opts.stack;
let filterPattern = opts.filter;
let colorPattern = opts.colorPattern || '';
let color = opts.color || 'yellow';
let startTime = getMsFromTimeString(opts.start) || Date.now() - 15 * 60 * 1000;
let endTime = getMsFromTimeString(opts.end) || Date.now();
let msgLength = typeof opts.msgLength === 'number' ? opts.msgLength : 350;

if (startTime >= endTime) {
    console.error(`Error: Start time '${opts.start}' may not be after end time '${opts.end}'! Please check your inputs.`);
    return;
}

let coloredClc = clc.yellow;
if (clc[color]) {
    coloredClc = clc[color];
}


// get all resources of the stack
cf.listStackResources({
    StackName: stackName
}).promise().then(data => {
    // filter out Lambdas from resources and retrieve their physical resource id's
    const resources = data.StackResourceSummaries;

    if (!resources) {
        console.log('No resources available.');
        return;
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
}).then(logGroups => {
    // now find all log events of a log group filtered by the specified filter pattern
    let logEventPromises = [];
    logGroups.forEach(logGroupName => {
        logEventPromises.push(logs.filterLogEvents({
            logGroupName: logGroupName,
            startTime: startTime,
            endTime: endTime,
            filterPattern: filterPattern
        }).promise());
    });
    return Promise.all(logEventPromises);
}).then(logEvents => {
    // now retrieve the actual message and its timestamp
    let outputMessages = [];
    if (logEvents && logEvents.length) {
        logEvents.forEach(logEvent => {
            if (logEvent && logEvent.events) {
                logEvent.events.forEach(event => {
                    outputMessages.push({
                        timestamp: event.timestamp,
                        message: event.message.trim()
                    });
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
}).then(sortedMessages => {
    // print the messages in a pretty way
    sortedMessages.forEach(msg => {
        let messageString = msg.message;
        let beginning = '';

        if (colorPattern === '') {
            beginning = new Date(msg.timestamp);
        } else {
            let regex = new RegExp(colorPattern);
            let match = messageString.match(regex);
            let end = match.index + match[0].length;
            beginning = messageString.substring(0, end);
            messageString = messageString.substring(end + 1);
        }

        if (msgLength > 0) {
            messageString = messageString.substring(0, msgLength);
        }

        console.log(coloredClc(beginning) + ' ' + messageString);
    });
}).catch(err => {
    console.log('An unexpected error occurred while retrieving Lambda logs: ', err);
});


/**
 * Gets the AWS region to use for further calls. It's accessing the region configured in AWS CLI if no region parameter was set when calling this CLI tool.
 * Default: 'us-east-1'
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
function getMsFromTimeString(timeString) {
    if (!timeString) {
        return 0;
    }

    timeString = timeString.trim();
    let unitName = timeString.charAt(timeString.length - 1);
    let factor = timeString.substring(0, timeString.length);

    return Date.now() - (parseInt(factor) * getUnitInMs(unitName));
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