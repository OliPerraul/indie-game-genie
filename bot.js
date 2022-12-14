require('dotenv').config();
const Discord = require('./discord.io');
const logger = require('winston');
const config = require('./config.json');
const utils = require('./utils.js');
const jsdom = require("jsdom");
const https = require('https');
const http = require('http');
const axios = require('axios');
const igdb = require('igdb-api-node').default;
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
});

// Heroku boiler plate
var express = require('express');
var app = express();
app.get('/', (req, res) => res.send(`${config.appName} discord bot`))
app.listen(process.env.PORT || 5000);


// Open AI
const openai = new OpenAIApi(configuration);

// Twitch
var twitch =
{
    id: process.env.TWITCH_ID,
    secret: process.env.TWITCH_SECRET,
    token: ""
};

// Configure logger settings

logger.remove(logger.transports.Console);

logger.add(new logger.transports.Console, {

    colorize: true
});

logger.level = 'debug';

// Initialize Discord Bot

var bot = new Discord.Client({

    token: process.env.DISCORD_TOKEN,

    autorun: true

});

bot.on('ready', function (evt) {

    logger.info('Connected');

    logger.info('Logged in as: ');

    logger.info(bot.username + ' - (' + bot.id + ')');
});

async function gameComment(game, count)
{
    if(count >= 100) return;

    completion = await openai.createCompletion({
        model: config.model,
        max_tokens: 300,
        prompt: config.prompt.replace("%NAME%", game.name),
    })    
    
    if(completion.data.choices[0].finish_reason == "length") 
    {
        await gameComment(count+1);
    }
    else
    {
        var comment = completion.data.choices[0].text;
        comment = comment.replace(/(\r\n|\n|\r)/gm, "");
        comment = comment.replace(/^["'](.+(?=["']$))["']$/, '$1');
        bot.sendMessage({
            to: config.channel,
            message: `${comment}\n${game.url}`        
        });
    }
}

archive = new Set(); // do not repeat games we have talked about in the past
archiveNames = new Set(); // for some reason, some games would display twice.
archivesClearRequested = false;

// Clear archive periodically every hour
function clearArchives()
{
    archive.clear();
    archiveNames.clear();
    archivesClearRequested = false;
}

function clearArchivesWithDelay()
{
    if(!archivesClearRequested)
    {
        archivesClearRequested = true;
        const epsilon = 100;
        setTimeout(clearArchives, (config.gameHoursAgo * 1000 * 3600) + epsilon); // clear archive every two hours        
    }
}

async function updateIndieGames(hoursAgo)
{
    try 
    {
        igdbClient = igdb(twitch.id, twitch.token);    

        time = utils.getHoursAgo(hoursAgo);
        response = await igdbClient    
        .where(`created_at > ${Math.floor(time.getTime() / 1000)} & genres = (${config.category})`) // filter the results
        // .where(`created_at > ${Math.floor(time.getTime() / 1000)}`) // filter the results
        .sort('created_at', 'desc')
        .limit(config.limit)
        .fields(['*', 'name'])
        .request('/games'); // execute the query and return a response object        

        changed = false;
        for ([key, game] of Object.entries(response.data))
        {
            if(!archive.has(game.id) && !archiveNames.has(game.name))
            {
                createdDate = new Date(game.created_at * 1000);
                console.log(createdDate);
                archive.add(game.id);
                archiveNames.add(game.name);
                await gameComment(game, 0);
                changed = true;
            }
        }

        if(changed)
        {
            clearArchivesWithDelay();
        }
    }
    catch(e)
    {
        console.log(`Unexpected error occured: ${e}`);
    }
    
    // repeat every 5 second
    // twitch will allow you to do 4 per second but this is enough
    setTimeout(arguments.callee, config.refresh * 1000, config.gameHoursAgo);
}

(async () => {
    response = await axios.post(
        `https://id.twitch.tv/oauth2/token?client_id=${twitch.id}&client_secret=${twitch.secret}&grant_type=client_credentials`);
    twitch.token = response.data.access_token;
    await updateIndieGames(config.gameHoursAgoStart);
})()


function startKeepAlive() {
    setInterval(function() {
        var options = {
            host: `${config.appName}.herokuapp.com`,
            port: 80,
            path: '/'
        };
        http.get(options, function(res) {
            res.on('data', function(chunk) {
                try {
                    // optional logging... disable after it's working
                    console.log("HEROKU RESPONSE: " + chunk);
                } catch (err) {
                    console.log(err.message);
                }
            });
        }).on('error', function(err) {
            console.log("Error: " + err.message);
        });
    }, 10 * 60 * 1000); // load every 20 minutes
}

startKeepAlive();




  
