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

  Usage: balloon [options]

  Options:

    -h, --help               output usage information
    -V, --version            output the version number
    -d, --destination [dir]  build directory
    -s, --source [dir]       source directory
    -w, --watch              watch and serve
```

