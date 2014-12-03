Balloon — Static Website Generator
==================================

*Because balloons generate static...*

Balloon is a very simple static site generator. Built for deploying to S3. It works for my needs,
but it's pretty simple.

View the [source code](https://github.com/gschier/schier.co) of [my website](http://schier.co).


Overview of Balloon
-------------------

- uses [Swig](http://paularmstrong.github.io/swig/) template language
- auto convert [Markdown](http://www.wikiwand.com/en/Markdown) to HTML if file ends in `.md`
    - supports Github-flavored Markdown features
    - auto syntax-highlights code blocks
- built-in webserver that auto-restarts on changed files
- S3 deploy functionality


Installation
------------

```bash
npm install -g balloon-generator
```


Usage
-----

```bash
# generate static based on settings in balloon.json (see below)
balloon
balloon --output ./another/destination/  # override build directory

# Same as above, except it watches for changes and serves the build directory
balloon --serve
balloon --serve 3000  # with port

# Get help
balloon --help
  Usage: balloon [options]

  Options:

    -h, --help             output usage information
    -V, --version          output the version number
    -s, --serve [port]     watch and serve files
    -b, --build <path>     override build path
    -d, --deploy [domain]  deploy to S3
```


Folder Structure
----------------

Here's what a base project looks like:

```bash
MyBalloonProject/
├── balloon.json  # Main config file (see below)
├── content/      # Website pages live here (markdown and/or HTML)
├── layouts/      # Layouts live here
└── static/       # Everything in here remains untouched (use for images, css, etc)
```

Here is something a bit more complicated:

```bash
MyBalloonProject/
├── balloon.json
├── content/
│   ├── index.html
│   ├── rss.xml
│   ├── blog/
│   │   ├── index.html
│   │   └── 2014/
│   │       └── 12/
│   │           ├── 04/
│   │           │   ├── My First Post.md
│   │           └── 08/
│   │               └── My Second Post.md
├── layouts/
│   ├── rss.xml
│   └── base.html
└── static/
    ├── favicon.ico
    ├── styles/
    │   └── main.css
    └── scripts/
        └── main.js
```

A few notes on what you see above:

- URL slugs are automatically generated from file names
- file paths will be equal to the URL path
    - Example `mysite.com/blog/2014/12/04/my-first-post.html`


Configuration
-------------

Balloon looks for a `balloon.json` file in the directory that it is run from. Here is an example
of a config:

```javascript
{
    /** Directory to watch */
    "source": "./",

    /** Directory to put built files */
    "build": "build/",

    /** The domain (S3 bucket) to deploy to */
    "domain": "website.com",

    /**
     * Context attributs (values) in each of these will apply if
     * the regex pattern (key) matches the URL path of the page
     * being rendered.
     */
    "defaults": {

        ".*": {
            // The only required context variable
            "_layout": "default.html",

            // Some useful variables to be used in templates
            "siteName": "My Website",
            "page_type": "basic"
        },

        "^/blog/.+": {
            "_layout": "blog.html",

            // Change the type for blog posts so the template knows
            // what to do
            "page_type": "blog"
        }
    }
}
```


Template Context
----------------

Balloon lets you define context variables in `balloon.json` (see below), but it also provides some
default ones that should be useful. All Balloon-generated variables start with underscores.

- `_title` name of the file, without the extension
- `_slug` full URL path of the current page
- `_created` an extracted date if the URL path contains the pattern `/YYYY/MM/DD/`
    - this is an object containing the properties `timestamp`, `year`, `month`, `day`
- `_pages` a list of all the pages that were rendered, along with the context for each one
    - only files named `index.html` and `rss.xml` have access to `_pages`
    - Example: useful for a `/blog/index.html` page to list all blog posts


Deploying to S3
---------------

Balloon has built-in support for deploying to Amazon S3. Simply run the command below and specify
the domain (bucket) you want.

```bash
balloon deploy mydomain.com
```


Other Notes
-----------

Right now I'm the only person I know of using Balloon in production. You can check out
[my site](http://schier.co) (also view [the source](https://github.com/gschier/schier.co)). I'm
always open to chat as well. You can find my contact info on my website.
