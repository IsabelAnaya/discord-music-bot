// based on https://gabrieltanner.org/blog/dicord-music-bot
// also referenced official discord.js and puppeteer documentation

const {
    Client,
    Intents
} = require('discord.js');
const {
    prefix,
    token
} = require('./config.json');
const ytdl = require('ytdl-core');
const client = new Client({ intents: [Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
const puppeteer = require('puppeteer');
const {
    AudioPlayerStatus,
    createAudioPlayer,
    joinVoiceChannel,
    createAudioResource,
} = require('@discordjs/voice');

const queue = new Map();
const subscriptions = new Map();


function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    const subscription = subscriptions.get(guild.id); //actually AudioPlayer
    //console.log(serverQueue);
    if (!song) {
        if (serverQueue) {
            const connection = serverQueue.connection;
            subscription.stop();
            connection.destroy();
        }
        queue.delete(guild.id);
        subscriptions.delete(guild.id);
        return;
    }

    resource = createAudioResource(ytdl(song.url, { filter: 'audioonly' }));

    //console.log(subscription);

    serverQueue.textChannel.send(`now playing: **${song.title}**`);
    subscription.play(resource)

    subscription.on(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })

    subscription.on("error", error => console.error(error));


}

function skip(message) {
    const serverQueue = queue.get(message.guild.id);
    const args = message.content.split(" ");
    //console.log(args);
    if (args.length > 1) {
        num = parseInt(args[1])
        if (serverQueue.songs.length >= num) {
            message.channel.send("skipping **" + serverQueue.songs[num - 1].title + "**");
            if (num == 1) {
                subscriptions.get(message.guildId).stop();
            } else {
                serverQueue.songs.splice(num - 1, 1);
            }
        } else {
            message.channel.send("not enough items in the queue");
        }
    } else {
        if (!message.member.voice.channel)
            return message.channel.send("join a voice channel first");
        if (!serverQueue)
            return message.channel.send("no songs in queue");
        subscriptions.get(message.guildId).stop();
        return ("skipping");
    }
}

function stop(message) {
    const serverQueue = queue.get(message.guild.id);
    if (!message.member.voice.channel)
        return message.channel.send("join a voice channel first");
    if (!serverQueue)
        return message.channel.send("no songs in queue");
    serverQueue.songs = [];
    subscriptions.get(message.guildId).stop();
}

function pause(message) {
    const serverQueue = queue.get(message.guild.id);
    if (!message.member.voice.channel)
        return message.channel.send("join a voice channel first");
    if (!serverQueue)
        return message.channel.send("no songs in queue");
    subscriptions.get(message.guildId).pause();
}

function unpause(message) {
    const serverQueue = queue.get(message.guild.id);
    if (!message.member.voice.channel)
        return message.channel.send("join a voice channel first");
    if (!serverQueue)
        return message.channel.send("no songs in queue");
    subscriptions.get(message.guildId).unpause();
}

async function execute(message, isPlaylist) {
    const args = message.content.split(" ");
    const voiceChannel = message.member.voice.channel;
    //console.log(voiceChannel);
    if (!voiceChannel) return message.channel.send("join a voice channel first");

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send("i can't join the voice channel");
    }

    //find all the songs to add
    var songsToPush = [];
    var numSongs = 0;
    if (isPlaylist) {
        var scrape = async() => {
            const browser = await puppeteer.launch({headless: true});
            const page = await browser.newPage();
            await page.goto(args[1]);

            const result = await page.evaluate(() => {
                var data = [];
                var elements = document.querySelectorAll('#video-title');
                elements.forEach(el => {
                    data.push('https://www.youtube.com' + el.getAttribute('href').split("&")[0]);
                });
                return data;
            });

            //console.log(result);
            browser.close();
            return result;
        }

        try {
            const res = await scrape();

            for (const song of res) {
                console.log(song);
                const songInfo = await ytdl.getInfo(song);
                songsToPush.push({
                    title: songInfo.videoDetails.title,
                    url: songInfo.videoDetails.video_url
                });
                numSongs++;
            }
        } catch (error) {
            return message.channel.send(`i don't think that's a playlist`);
        }

    } else {
        try {
            const songInfo = await ytdl.getInfo(args[1]);
            songsToPush.push({
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url
            });
            numSongs = 1;
        } catch (error) {
            return message.channel.send(`can't add that as a song`);
        }

    }

    console.log(songsToPush);

    serverQueue = queue.get(message.channel.guildId);
    if (!serverQueue) {
        //create contract for queue
        const queueContract = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true
        };

        //set up queue
        queue.set(message.guild.id, queueContract);

        //push song to array
        songsToPush.forEach(song => {
            queueContract.songs.push(song);
        });

        try {
            const audioPlayer = createAudioPlayer();


            //join voice
            var connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator
            });
            queueContract.connection = connection;

            connection.subscribe(audioPlayer);
            subscriptions.set(message.guild.id, audioPlayer);

            //start playing
            if (isPlaylist) {
                message.channel.send(`playlist added (${numSongs} items)`);
            }
            play(message.guild, queueContract.songs[0]);
        } catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return;
        }
    } else {
        songsToPush.forEach(song => {
            serverQueue.songs.push(song);
        })

        //console.log(serverQueue.songs);
        if (isPlaylist) {
            return message.channel.send(`playlist added (${numSongs} items)`);
        } else {
            return message.channel.send(`**${songsToPush[0].title}** added to queue`);
        }
    }
}

function helpme(message) {
    helpstring =
    `${prefix}help - show commands
${prefix}play <URL> - play audio from youtube link
${prefix}playlist <URL> - add to queue from playlist
${prefix}skip <number>- skip song in queue, or current song if no number is given
${prefix}stop - remove everything in the queue and end song
${prefix}pause - pause current song
${prefix}unpause - unpause song
${prefix}queue - print current queue`;
    return message.channel.send(helpstring);
}

function printqueue(message) {
    const serverQueue = queue.get(message.guild.id);
    //console.log(serverQueue);
    if (serverQueue != null && serverQueue.songs.length > 0) {
        bit = ''
        count = 1
        serverQueue.songs.forEach(song => {
            bit += count + ". **" + song.title + "**\n";
            count++;
        });
        return message.channel.send(bit);
    } else {
        return message.channel.send("nothing in queue.")
    }
}



client.once('ready', () => {
    console.log('Ready!');
});

client.on('messageCreate', message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const piece = message.content.split(" ")[0];

    switch(piece) {
        case (`${prefix}play`):
            execute(message, false);
            return;
        case (`${prefix}playlist`):
            execute(message, true);
            return;
        case (`${prefix}skip`):
            skip(message);
            return;
        case (`${prefix}stop`):
        case (`${prefix}end`):
            stop(message);
            return;
        case (`${prefix}pause`):
            pause(message);
            return;
        case (`${prefix}unpause`):
            unpause(message);
            return;
        case (`${prefix}help`):
            helpme(message);
            return;
        case (`${prefix}queue`):
            printqueue(message);
            return;
        default:
            message.channel.send(`Invalid command. ${prefix}help for commands`);
            return;
    }
})

client.login(token);
