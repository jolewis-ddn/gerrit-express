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

Set the config file (`saveHistory` and `historyDir` are the only optional settings)

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

## Built With

* node-fetch
* debug
* config
* node-cache
* express

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your/project/tags). 

## Authors

* **John D. Lewis** - [jolewis-ddn](https://github.com/jolewis-ddn)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
