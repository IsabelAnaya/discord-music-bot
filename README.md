# discord-music-bot
AKA **robodog**

Small Discord bot that plays audio from Youtube links in a voice channel.

To set up: replace 'TOKEN' in config.json with a valid Discord bot token. Then run: 
```
npm install
node index.js
```

The default command prefix is '&'. This can be changed in the config file.
Current commands:
```
help
play <URL>
playlist <URL>
skip <number (optional)>
stop
pause
unpause
queue
```

Works best in a single server.