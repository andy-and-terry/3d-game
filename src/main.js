const { app } = require('electron');
const worldsManager = require('./worlds_manager');

app.whenReady().then(() => {
  worldsManager.init(app);
});
