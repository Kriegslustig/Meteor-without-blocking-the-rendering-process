if (Meteor.settings.approach === 'crowbar') {

  WebApp.connectHandlers.use(function (req, res, next) {
    connectMangler.goFish(res)
    next()
    var meteorHead = getHead(connectMangler.releaseEm(res).write[0][0])
    var renderedHTML = getTemplate.call({foot: meteorHead}, 'main-crowbar')
    res.end(renderedHTML)
  })

  function getHead (html) {
    return html.split('<head>')[1].split('</head>')[0]
  }

  var connectMangler = (function connectMangler () {
    var realRes = {}
    var caughtStuff = {}

    function capture (obj, key) {
      realRes[key] = obj[key]
      obj[key] = function (/*arguments*/) {
        if(!caughtStuff[key]) caughtStuff[key] = []
        caughtStuff[key].push(arguments)
      }
    }

    function release (obj) {
      _.extend(obj, realRes)
    }
    return {
      goFish: function (res) {
        capture(res, 'write')
        capture(res, 'end')
      },
      releaseEm: function (res) {
        release(res)
        return caughtStuff
      }
    }
  })()

}