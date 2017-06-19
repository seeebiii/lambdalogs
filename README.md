# lambdalogs
A CLI tool to trace [AWS Lambda](https://aws.amazon.com/lambda/) calls over multiple
[CloudWatch log groups](http://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html).
The Lambda functions are identified by searching your CloudFormation stack.


## Requirements
* It assumes you have [setup your AWS CLI](http://docs.aws.amazon.com/cli/latest/userguide/installing.html) correctly.
* You need to provide a CloudFormation stack name. Based on the stack, the Lambda functions and related log groups can be found and searched.


## Install

### npm
```
npm install -g lambdalogs
```

### yarn

```
yarn global add lambdalogs
```


## Usage

```
lambdalogs
--stack stackName
--filter pattern
[--region awsRegion]
[--colorPattern pattern]
[--color color] 
[--start timestamp] 
[--end timestamp] 
[--msgLength messageLength]
```

### Options
* **--stack** a CloudFormation stack name which contains lambda functions
* **--filter** a [CloudWatch filter pattern](http://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html)
* **--region** optional: you can set the AWS region for your CloudFormation stack and CloudWatch logs. By default the region configured in your AWS CLI is used. As a fallback 'us-east-1' is used.
* **--colorPattern** optional: for a colored output, you can set a pattern which tries to match your messages and colors the matched output. By default only the timestamp of the log event is colored (see `--color`).
* **--color** optional: for a colored output, you can set the color of the matched pattern (see `--colorPattern`). The color must be supported by [cli-color](https://www.npmjs.com/package/cli-color).
* **--start** optional: you can set the start time to begin with the search for log events. By default the last 15 minutes from now will be searched, so `start` is equal to `Date.now() - 15*60*1000`. See also `--end`.
* **--end** optional: you can set the end time to stop with the search for log events. By default the last 15 minutes from now will be searched, so `end` is equal to `Date.now()`. See also `--start`.
* **--msgLength** optional: you can set a maximum length for the message output. This means only the first X characters will be printed. By default this is set to `350`. This is useful to keep an overview.


## Author

[Sebastian Hesse](https://www.sebastianhesse.de)


## License

MIT License

Copyright (c) 2017 [Sebastian Hesse](https://www.sebastianhesse.de)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.