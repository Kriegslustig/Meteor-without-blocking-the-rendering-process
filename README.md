# Meteor-without-blocking-the-rendering-process
Instructions on serving Meteor without blocking the rendering process

[I'm writting a package for this, it's called `altboiler`.](https://github.com/Kriegslustig/meteor-altboiler)

## The Idea

The Idea is to utilise the [Server-Side Rendering package](https://github.com/meteorhacks/meteor-ssr) and the core package [WebApp](https://github.com/meteor/meteor/tree/devel/packages/webapp) to achieve this.

## Execution

### Generating the HTML to serve

For this we'll need to `meteor add meteorhacks:ssr`.

First, we'll generate the HTML which will be Served using `WebApp`. Generating `SSR` Templates is a little different from normal ones. First of all the template files will only be located on the Server. They will be retrieved using `Assets.getText` so they have to be in the `private` directory.

_private/templates/example.html_

```
<h1>Say Hi!</h1>
<p>Hey {{ name }}. :O</p>
```

_private/templates/main.html_

```
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hi...</title>
</head>
<body>
  {{{ getTemplate "example" }}}
</body>
</html>
```

Notice that there are no `template`-tages wrapped around our templates. That's because we don't want meteor to use these as templates. An important part is also the call to the `getTemplate` helper. We can't use the standard `>` here, because the templates we want to import aren't normal Blaze template instances. So we define a helper:

_server/lib/templateHelpers.js_

```
// A function that retrieves plain text templates from the private/templates directory
getRawTemplate = function getRawTemplate (templateName) {
  return Assets.getText('templates/' + templateName + '.html')
}

// Renders a template and returns HTML
// You can bind a context to it to use it as a context for the template
getTemplate = function getTemplate (templateName) {
  SSR.compileTemplate(templateName, getRawTemplate(templateName))
  return SSR.render(templateName, this)
}

// Register the getTemplate function as a helper
Template.registerHelper('getTemplate', getTemplate)
```

So now we can render the main template:

_server/main.js_

```
SSR.compileTemplate('sayHi', Assets.getText('example.html'))
var renderedHTML = SSR.render('sayHi', {name: 'Jude'})
```

This is just a very simple and not very practical example. For further infos on the usage of `SSR` check out [it's repo](https://github.com/meteorhacks/meteor-ssr).

### Serving the HTML

Now we can simply use `WebApp` to server the generated HTML.

_server/main.js_

```
var renderedHTML = getTemplate.call({name: 'Jude'}, 'main')

WebApp.connectHandlers.use('/', function (req, res, next) {
  res.end(renderedHTML)
})
```

## Serving the meteor boilerplate

Ok now we are serving `HTML` the next step is serving meteor. This isn't as easy as it sounds. There are a lot of possible approaches to this here are a few. In my example I'm rendering a loading screen that shows before meteor is loaded. Then meteor takes over and you can use something like an `iron:router` to render Templates client side.

### The Crowbar approach (messing with `connect`)

THIS APPROACH DOES'NT FULLY WORK, but it was the first one i found so here it is. Using `WebApp.connectHandlers` you can do sort of a MIM between [`connect`](https://github.com/senchalabs/connect/) and `meteor`.

Here's the code:

```
WebApp.connectHandlers.use(function (req, res, next) {
  connectMangler.goFish(res)
  next()
  var meteorHead = getHead(connectMangler.releaseEm(res).write[0][0])
  var renderedHTML = getTemplate.call({foot: meteorHead}, 'main')
  res.end(renderedHTML)
})
```

As you can probably tell, I defined an object `connectMangler` outside of this snipped. I want to keep it simple, so I'll just explain it. If you want to see the implementation; You can find it in [`server/crowbar.js`](https://github.com/Kriegslustig/Meteor-without-blocking-the-rendering-process/blob/master/server/crowbar.js). `connectMangler.goFish` takes a `response` object as a parameter. It overrides all the functions on `response` that are used by meteor with *capturers*. Those store the parameters passed to the functions by meteor inside the `connectMangler`. So when the [meteor `WebApp` internals](https://github.com/meteor/meteor/blob/devel/packages/webapp/webapp_server.js) call [`res.write(boilerplate)`](https://github.com/meteor/meteor/blob/devel/packages/webapp/webapp_server.js#L692), they aren't actually calling the function provided by `connect` but my *capturer*. Then I call `connectMangler.releaseEm` which reverts the `response` object to it's original state and returns the captured arguments. The captured arguments are stored inside an object which has a key containing an array for each function of `response` that was replaced. So it has one called `write`. It contains an array for each time `res.write` was called and another one containing all the arguments of the call. So I'm taking the first argument of the first call to write (`connectMangler.releaseEm(res).write[0][0]`). This contains the whole meteor boilerplate as a string. Now I call `getHead`, which simply takes out the `head` element using `split`s. The next step is to render the `main-crowbar`-template. It looks a little different now:

```
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hi...</title>
</head>
<body>
  <div id="fubarLoader">
    {{{ getTemplate "example" }}}
  </div>
  {{{ foot }}}
  <script type="text/javascript">
    document.addEventListener('readystatechange', function () {
      console.log(document.readyState)
      if(document.readyState != 'complete') return
      document.body.removeChild(document.getElementById('fubarLoader'))
    })
  </script>
</body>
</html>
```

As you can see; what was inside the `head` before is now at the bottom of the `body`. But there's a *little* problem with `HCP`... It's sort of broken. When something changes in your code, it goes into an infinite loop and constantly reloads the page. Then you must get the Page to fully reload. You can do that by restarting meteor. So that solution is absolutely useless.


### The "Push and shove" approach

I tried looking through the Meteor-Core to find out how the `Boilerplate` is generated. The components involved are [`WebApp`](https://github.com/meteor/meteor/tree/devel/packages/webapp) and [`Boilerplate`](https://github.com/meteor/meteor/tree/devel/packages/boilerplate-generator). This is how meteor gets there:

[_meteor_](https://github.com/meteor/meteor/blob/devel/meteor#L133)
```
...
METEOR="$SCRIPT_DIR/tools/main.js"
...
exec "$DEV_BUNDLE/bin/node" "$METEOR" "$@"
````

[_tools/main.js_](https://github.com/meteor/meteor/blob/devel/tools/main.js#L490)
```
...
var executable = files.pathJoin(packagePath, toolRecord.path, 'meteor');
...
require('kexec')(executable, newArgv);
...
```

Now the next step took me a while to find. It's important to know how the `WebApp` export works.

[_packages/webapp/package.js_](https://github.com/meteor/meteor/blob/devel/packages/webapp/package.js#L36)
```
  ...
  api.addFiles('webapp_client.js', 'client');
  ...
```

This is pretty straight forward. A simple export. Now here comes the interesting part.

[_packages/webapp/webapp_server.js_](https://github.com/meteor/meteor/blob/devel/packages/webapp/webapp_server.js#L763)
```
...
runWebAppServer();
...
```

This doesn't look special, but for me it was kinda weird to see. It's a function execution on the root level. So when you add `WebServer` this function will always get executed. This seriously confused me and I feel it's bad practice.

Meteor [adds the WebApp package by default](https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/meteor-platform/package.js#L20) through the `meteor-platform` package.

Inside the [`runWebAppServer`](https://github.com/meteor/meteor/blob/devel/packages/webapp/webapp_server.js#L442) function, Meteor calls [`WebAppInternals.getBoilerplate`](https://github.com/meteor/meteor/blob/devel/packages/webapp/webapp_server.js#L243), function which uses the [`boilerplateByArch`](https://github.com/meteor/meteor/blob/devel/packages/webapp/webapp_server.js#L552) object. This is partly defined by [`WebApp.clientPrograms`](https://github.com/meteor/meteor/blob/devel/packages/webapp/webapp_server.js#L497). This is where it finally gets interesting. It's a cache containing what meteor calls `manifest`s. These manifest contain all required scripts. It's exactly what we are looking for. So I give it a try.

First we'll have to get the files we want to included served. To do that we'd need to figure out what architecture we're working with. Since there is no easy way of doing that (not yet at least), we'll just use the default, Which is `web.client`. It's stored inside `WebApp.defaultArch`. So that makes it somewhat dynamic. Then we need to read the manifest which is an array. To that array of includes we also need to add `WebAppInternals.additionalStaticJs`. We shouldn't use this variable, as it's stated [in the source code](https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/webapp/webapp_server.js#L791). But there seems to be some disagreement about what `WebAppInternals` is actually for. I say this, because its used [all](https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/autoupdate/autoupdate_server.js#L61) [over](https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/reload-safetybelt/reload-safety-belt.js#L6) [the](https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/autoupdate/autoupdate_server.js#L89) [place](https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/browser-policy-content/browser-policy-content.js#L140). Mostly dough by the [`reload-safetybelt`](https://github.com/meteor/meteor/tree/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/reload-safetybelt) package. I'm not sure about how `WebAppInternals.additionalStaticJs` actually is, but I guess we have to comply with this weirdness. Anyway, now we should have an array containing all the scripts we want to include. We then encode it in `EJSON` and add it to the data context of the main template.

_server/pushAndShove.js_
```
WebApp.connectHandlers.use(function (req, res, next) {
  res.end(getTemplate.call(getTemplateData(), 'pushAndShove'))
})

function getTemplateData () {
  var data = {
    includes: getIncludes(WebApp.defaultArch),
    meteorRuntimeConfig: __meteor_runtime_config__ || {}
  }
  _.each(data, function (value, key) {
    data[key] = EJSON.stringify(value)
  })
  return data
}

function getIncludes (arch) {
  return WebApp.clientPrograms[arch].manifest.concat(parseStaticJS(WebAppInternals.additionalStaticJs))
}

function parseStaticJS (staticJsObj) {
  var returnArr = []
  _.each(staticJsObj, function (js, key) {
    returnArr.push({
      type: 'js',
      url: key
    })
  })
  return returnArr
}
```

We are also passing the `__meteor_runtime_config__` to the template. This is because it's used client-side. The `EJSON` string is automatically parsed by `SSR`. So in the main template we can do this:

_private/templates/pushAndShove.html_
```
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <script type="text/javascript">
    var __meteor_runtime_config__ = {{ meteorRuntimeConfig }}
  </script>
</head>
<body>
  <script type="text/javascript" id="boilerPlateLoader">
    (function (includes) {
      var urlPrefix = jsCssPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
      includes.forEach(includeRenderer(document.head))
      document.body.removeChild(document.getElementById('boilerPlateLoader'))
...
```

Now here's where it gets hairy. Inside the function returned by `includeRenderer` I'm creating new `script`/`link` tags and appending them to the element passed as an argument. `document.head` in this case. When you dynamically create `script`-elements, they get leaded asynchronously. I expected that not to be a problem, since dependency resolution [isn't a very hard to handle](https://en.wikipedia.org/wiki/Topological_sorting#Algorithms). Loading all packages synchronously is a solution, but not a very nice one. It's very slow. In production of course, this is no problem. Because the scripts all get concatenated into a single file.

The `underscore` package is the only one with no dependencies. So it defines the `Package` variable. All other packages will fail loading because they check for `Package` to be defined. Which it is improbable to be. To solve this we have to add a script, wait for it to load, add the next, wait and so on. This is much slower that it would be to just server these scripts inside the header in the first place. That's because when the browser comes across resources to be loaded, it fetches them as fast as possible. Once it has fetched the first one, it starts triggering execution of the fetched scripts in the right order. The nicest way to simulate this by using [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/GlobalFetch). Sadly, though it's still in an experimental state.

We can simulate this using `XMLHttpRequest`s. It gets the job done even tough it's only half as nice as `fetch`. Locally it's about 10x faster to do these request asynchronously. So this is what I ended up doing (again I tried to take out the relevant parts):

[_private/templates/pushAndShove.html_](https://github.com/Kriegslustig/Meteor-without-blocking-the-rendering-process/blob/ecd973f970ce101383ddbf1589a7f0a93b1376be/private/templates/pushAndShove.html#L21)
```
...

function includeRenderer(appendTo, includes) {
  function appendScript (id, script) {
    appendTo.appendChild(createScriptTag(script, 'meteorScript' + id))
  }
  appendScript('-1', '')
  console.log(includes.map(function (val) {return val.path}))
  includes.forEach(function (include, index) {
    fetchScript(
      urlPrefix + include.url,
      depChecker('meteorScript' + (index - 1), appendScript.bind(null, index))
    )
  })
  depChecker('meteorScript' + (includes.length - 1), document.body.removeChild(document.getElementById('boilerPlateLoader')))
}

...

function depChecker (waitForElem, callback) {
  var args = arguments
  return function (data) {
    console.log(waitForElem)
    if(document.getElementById(waitForElem)) return callback(data)
    setTimeout(depChecker.apply(null, args).bind(null, data), 1)
  }
}
```

That's pretty close to what we're going for. This kinda works in some browsers, but not in all. And of course `HCP` doesn't work. It seems that there's still some dependency resolution problem.

When I load the site in Chorme I get an error `Spacebars is not defined` from within `packages/iron:layout/template.default_layout.js`. Now this seems to me to be the correct behaviour, because when I look at the manifest paths I see something like this:

```
...
packages/iron_core.js
packages/iron_dynamic-template.js
packages/iron_layout.js
packages/iron_url.js
packages/iron_middleware-stack.js
...
packages/spacebars.js
...
```

Oddly enough it works in FF dough. But when I do this:

```
if(document.getElementById(waitForElem)) return setTimeout(callback.bind(null, data), 100)
```

Which delays the script insert by `100` milliseconds, I get the same error in FF as in Chrome. The one way that has to work though, is if I simply buffer the scripts inside a string. As soon as the last one has been buffered, I append the whole thing to the head. This is a little more complex, because of the buffering part. Here are the important parts of the script I added:


_assets/templates/pushAndShove.html_
```
...

function includeRenderer(appendTo, includes) {
  var allScripts = ''
  var nthScriptLoaded = -1

  [...]

  includes.forEach(function (include, index) {
    fetchScript(
      urlPrefix + include.url,
      depChecker(loadedChecker(index - 1), loadScript)
    )
  })
  depChecker(loadedChecker(includes.length - 1), cleanUpAndAppend)()
}
...
```

This works and performs pretty well. Now to why this works and loading it in separate script tags did not. I believe, that the reason is hoisting. The browser normally parses script tags on by one. What it roughly does is; it goes through a scope, hoists and then executes the script. It does this process for every script separately. Meaning when you rely on hoisting and split the script into two separate script-tags it will fail. Makes sense, right?

But why does it work when loading all the scripts as external resources at the beginning. Honestly I don't have a clue. My guess is that JS treats external script-tags inside the head and inline script-tags differently. Anyway I'm still figuring this out. (I also might have forgotten about it by now)

This solution works and I haven yet to find a problem with it. It'll probably make the initial load a bit slower (might not be true loading the scripts via AJAX was faster in the tests I ran). Even if there was a small performance loss, I think it's well worth the better UX.

### [The "Serious Business" Approach](https://github.com/Kriegslustig/meteor-altboiler)

Now to do use this in production we'll definitely want a well tested Package. So that's what I'm creating. Right now, with the `pushAndShove` solution, we are circumventing the whole Boilderplate package. The Boilderplates are still cached to. So the nicest solution would be to replace the whole `boilerplate-generator` package and its `Boilerplate` variable. So that's what I'll try to do.
