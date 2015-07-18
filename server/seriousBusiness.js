if (!Meteor.settings.approach || Meteor.settings.approach === 'seriousBusiness') {
  WebApp.rawConnectHandlers.stack = [{
    route: '/altboiler/main.js',
    handle: function (req, res, next) {
      return setTimeout(next, 4000)
    }
  }].concat(WebApp.rawConnectHandlers.stack)

  altboiler.config({
    css: Assets.getText('styles.css')
  })
}
