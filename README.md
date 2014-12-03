Balloon Static Site Generator
=============================

Very simple static site generator. Built for deploying to S3. It works for my needs, but it's pretty simple.


### Installation

```bash
npm install balloon --save
```


### Usage

```bash
# build from source to destination
balloon --source . --destination build

# Same as above, except it watches for changes and serves the build directory
balloon --watch --source . --destination build

# Get help
balloon --help
  Usage: balloon [options] <BUILD_PATH>

  Options:

    -h, --help               output usage information
    -V, --version            output the version number
    -s, --build [DIRECTORY]  source directory
    -d, --deploy <DOMAIN>    deploy to S3
    -s, --serve              watch and serve files
```

### Deploying

```bash
balloon deploy
```
