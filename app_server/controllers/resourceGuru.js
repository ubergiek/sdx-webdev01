/* GET Main Page for ResourceGuru options/actions */

require('dotenv').load();
var simpleOauthModule = require('./../../node_modules/simple-oauth2');
const async = require('async');
const request = require('request');
var nodemailer = require('nodemailer');

//Global Token
var authToken = '';
var baseUrl = 'https://api.resourceguruapp.com/v1/varrow';

//Mail options
var mailData = envMailData = {
    from: process.env.mailFrom,
    to: process.env.mailTo,
    subject: process.env.mailSubject,
    text: 'Plaintext version of the message',
    html: 'HTML version of the message',
    attachments: []
};

console.log("id from env: " + process.env.mailFrom)
const oauth2 = simpleOauthModule.create({
  client: {
    id: process.env.resourceGuru_id,
    secret: process.env.resourceGuru_sk,
  },
  auth: {
    tokenHost: 'https://api.resourceguruapp.com',
    tokenPath: '/oauth/token',
    authorizePath: '/oauth/authorize',
  },
});

// Authorization uri definition
const authorizationUri = oauth2.authorizationCode.authorizeURL({
  redirect_uri: 'http://localhost:3000/callback',
});

var transporter = nodemailer.createTransport({
    transport: 'ses', // loads nodemailer-ses-transport
    accessKeyId: process.env.AWS_AK,
    secretAccessKey: process.env.AWS_SK
});

// Initial page redirecting to Github
module.exports.auth = function(req, res) {
  console.log(authorizationUri);
  res.redirect(authorizationUri);
};

// Callback service parsing the authorization token and asking for the access token
module.exports.callback = function(req, res) {
  const code = req.query.code;

  const tokenConfig = {
    code: code,
    redirect_uri: 'http://localhost:3000/callback'
  };

  oauth2.authorizationCode.getToken(tokenConfig, (error, result) => {
    if (error) {
      console.error('Access Token Error', error.message);
      console.log('Code: ' + code);
      return res.json('Authentication failed');
    }

    console.log('The resulting token: ', result);
    const token = oauth2.accessToken.create(result);

    authToken = token;
    return res
      .status(200)
      //.json(token)
      //.send(JSON.stringify(token, undefined, 2) + '<br><a href="/skills">Skills Page</a><br><a href="/resources">Resources Page</a>');
      .redirect('/rg');
  });
};

module.exports.index = function(req, res) {
    res.render('resourceGuru', {title: 'Resource Guru'});
}

module.exports.getResourceSkills = function(req, res, next) {
    var resourceIds = [];
    var resources = [];
    var csv = [];
    var csvPlainText = "";
    async.series([
      function(callback) {
        var requestUrl = baseUrl + '/resources?access_token=' + authToken.token.access_token;
    
        request(requestUrl, function (err, response, body) {
          if(err) { 
              console.log("Error occurred while accessing RG");
              console.log(err); 
              res.send(500, "Server Error while retieving resources..."); 
              callback(true); 
              return; 
          }
          if (!body) { callback(true); return;}
          var obj = JSON.parse(body);
          for (var i in obj) {
            resourceIds.push(obj[i].id);
          }
          callback(false);
        });
    },
      function(callback) {
        async.each(resourceIds, function(resourceId, callback) {
          var requestUrl = '';
          console.log('ResourceId: ' + resourceId)
          requestUrl = baseUrl + '/resources/' + resourceId + '?access_token=' + authToken.token.access_token;
          request(requestUrl, function (err, response, body) {
            if(err) { console.log(err); res.send(500,"Server Error while retrieving resource skills..."); return; }
            var resourceDetails = {};
            var jsonResponse = JSON.parse(body);
            resourceDetails.id = jsonResponse.id;
            resourceDetails.name = jsonResponse.name;
            resourceDetails.job_title = jsonResponse.job_title
            resourceDetails.skills = [];
            for (var i in jsonResponse.selected_custom_field_options) {
             if (jsonResponse.selected_custom_field_options[i].name === 'Skills') {
              resourceDetails.skills.push(jsonResponse.selected_custom_field_options[i].value);
             }
            }
            console.log(JSON.stringify(resourceDetails));
            resources.push(resourceDetails);  
            callback(); 
          });
        }, function (err) {
          if (err) {
            console.log("Error with one of the resource skills collections")
          }
          else {
            console.log("All resources iterated successfully.")
            callback();
          }
          }
        );
    }
  , function(callback) {
    //Convert JSON results to CSV
    var resource;
    var csvString = "";
    csv.push("id,name,job_title,skill")
    csvPlainText = "id,name,job_title,skill\r\n"
    for (var i in resources) {
      resource = resources[i]
      if (resource.skills.length === 0) {
        console.log("Resource: " + resource.name + " has no skills defined")
        csvString = resource.id + "," + resource.name + "," + resource.job_title + "," + "No skills defined" 
        csvPlainText += csvString + "\r\n"
        csv.push(csvString);
      }
      else {
        console.log("Resource: " + resource.name + " skills are being recorded");
        for (var x in resource.skills) {
          csvString = resource.id + "," + resource.name + "," + resource.job_title + "," + resource.skills[x] 
          csvPlainText += csvString + "\r\n"
          csv.push(csvString);
        }
      }
    }
    callback();
  }], function (err, results) {
    if(err) { console.log(err); res.render("Server Error while making resource REST calls"); return; }
    console.log('Final callback: ' + JSON.stringify(resources));
    //res.send("<pre>" + JSON.stringify(resources, undefined, 2) + "</pre>");
    //res.setHeader('content-type', 'text/plain');
    res.render('resourceGuru', { "data": resources });
    mailData.attachments = [{
            filename: 'resources.csv',
            content: csvPlainText,
            //encoding: 'base64'
    }];
  });  
};

module.exports.rgEmailReport = function(req, res) {
    transporter.sendMail(mailData, function(error, info) {
        if(error){
            return console.log(error);
        }
            console.log('Message sent: ' + info.response);
            res.send(info.response);
    });
        
}

module.exports.testEmail = function(req, res) {
    transporter.sendMail(mailData, function(error, info) {
        if(error){
            return console.log(error);
        }
            console.log('Message sent: ' + info.response);
            res.send(info.response);
    });
        
}