# Meteor-without-blocking-the-rendering-process
Instructions on serving Meteor without blocking the rendering process

## The Idea

The Idea is to utilities the [Server-Side Rendering package](https://github.com/meteorhacks/meteor-ssr) and the core package [WebApp](https://github.com/meteor/meteor/tree/devel/packages/webapp) to achieve this.

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

As you can see; what was inside the `head` before is now at the bottom of the `body`. But there's a *little* problem with `HCR`... It's sort of broken. When something changes in your code, it goes into an infinite loop and constantly reloads the page. Then you must get the Page to fully reload. You can do that by restarting meteor. So that solution is absolutely useless.
