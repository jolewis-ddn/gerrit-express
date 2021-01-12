# gerrit-express

Custom Gerrit reporting and statistics

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

What things you need to install the software and how to install them

* Running Gerrit server
* Node 14+ (requires `replaceAll` String method)
* NPM

### Installing

A step by step series of examples that tell you how to get a development env running

Download the software

```
git fetch ...
```

Install required Node modules

```
npm i
```

Set the config file (`saveHistory` and `historyDir` are the only optional settings). (See the config file options, below.)

```
cp config/default-template.json config/default.json
vi config/default.json
```

Run the app

```
npm start
```

Available endpoints (update the port to match your config file's `port` value):

1. `http://localhost:3000/`
1. `http://localhost:3000/stats`

## Configuration
### Required Configuration Parameters
* **gerritUrlBase**: Gerrit URL (protocol, hostname, and (optional) port) - e.g. "https://gerrit.hostname.com:8000"
* **openQuery**: Gerrit string for query - e.g. "is:open"
* **gerritUrlSuffix**: Gerrit closing string - e.g. "&o=DETAILED_LABELS&o=CURRENT_COMMIT&o=ALL_REVISIONS&o=DETAILED_ACCOUNTS&o=REVIEWED"
* **dataDir**: Directory to store the output files - e.g. "data"
* **dataFileName**: Filename for the output file - e.g. "Open"
* **dataFileExt**: Extension for teh output file - e.g. ".json"
* **port**: Port for this application - e.g. 3000

### *Optional* Configuration Parameters
* **saveHistory**: Should history be saved - e.g. true
* **historyDir**: Directory to store the history files - e.g. "data-archive"
* **slack**: Slack-specific sub-section
  * **slack.enabled**: Turn on Slack messages - e.g. false
  * **slack.slackWebhookUrl**: Webook for Slack - e.g. "https://hooks.slack.com/ENTER_PARAMETERS_HERE"

## Built With

* node-fetch
* debug
* config
* node-cache
* express

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/jolewis-ddn/gerrit-express/tags). 

## Authors

* **John D. Lewis** - [jolewis-ddn](https://github.com/jolewis-ddn)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
