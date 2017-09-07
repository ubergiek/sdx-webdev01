/* GET Main Page for ResourceGuru options/actions */

require('dotenv').load();
var simpleOauthModule = require('./../../node_modules/simple-oauth2');
const async = require('async');
const request = require('request');
var nodemailer = require('nodemailer');
var Q = require('q');

//Global Token
var resourceLimit = '0'
var authToken = '';
var baseUrl = process.env.resourceGuru_apiEndpoint;

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

var getResourceSkillLevel = function(skill) {
  var skillLevel = 'N/A';
  if (skill !== "No skills defined") {
    var skillArray = skill.split(' ');
    var regexp = /Associate|Architect|Implementation/gi;

    if (skillArray.length > 0) {
      if (skillArray[skillArray.length - 1].match(regexp)) {
        skillLevel = skillArray[skillArray.length -1]
      }
    }
  }
  return skillLevel;
}

var getSkillBrandLevel = function (skill, level) {
  var skillBrand = 'N/A';
  if (skill !== "No skills defined") {
    var skillArray = skill.split(' ');
    if (level === 1 && skillArray.length >= 1) {
      skillBrand = skillArray[0];
    }
    else if(level === 2 && skillArray.length >= 2) {
      skillBrand = skillArray[0] + " " + skillArray[1];
    }
  }
  return skillBrand;
}

var getCityFromLocation = function (location) {
  var city = '';
  if (typeof location === "string") {
    var cityStateArray = location.split(",");
    if (cityStateArray.length > 1) {
        city = cityStateArray[0].trim();
    }
  }
  return city;
}

var getStateFromLocation = function (location) {
  var state = '';
  if (typeof location === "string") {
    var cityStateArray = location.split(",");
    if (cityStateArray.length > 1) {
        state = cityStateArray[1].trim();
    }
  }
  return state;
}

var formatEngineerCsvEntry = function(resource) { 
      var csvString = '';
      var resourceArray = [];
      if (resource.skills.length === 0) {
        console.log("Resource: " + resource.name + " has no skills defined")
        resource.skills = ["No skills defined"]
      }
    //resourceArray = [resource.id, resource.name, resource.city, resource.state, resource.brand, resource.manager, resource.region, SKILL, SKILL_LEVEL, BRAND_LEVEL1, BRAND_LEVEL2];
      resourceArray = [resource.id, resource.name, resource.email, resource.city, resource.state, resource.brand, resource.manager, resource.region, "", "", "", ""];
      for (var x in resource.skills) {
          var skill = resource.skills[x];
          resourceArray[8] = skill
          resourceArray[9] = getResourceSkillLevel(skill);
          resourceArray[10] = getSkillBrandLevel(skill, 1);
          resourceArray[11] = getSkillBrandLevel(skill, 2);
          csvString += resourceArray.map(function(str) {
            return "\"" + str + "\"";
          }).join(",") + "\r\n"
      }
      console.log(csvString);
      return csvString;
};

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
        var requestUrl = baseUrl + '/resources?limit=' + resourceLimit + '&access_token=' + authToken.token.access_token;
    
        request(requestUrl, function (err, response, body) {
          if(err) { 
              console.log("Error occurred while accessing RG");
              console.log(err); 
              res.send(500, "Server Error while retieving resources..."); 
              callback(true); 
              return; 
          }
          if (!body) { callback(); console.log("No body returned from Resources REST request."); return;}
          var obj = JSON.parse(body);
          for (var i in obj) {
            resourceIds.push(obj[i].id);
          }
          callback(false);
        });
    },
      function(callback) {
        console.log('ResourceCount: ' + resourceIds.Length);
        async.each(resourceIds, function(resourceId, callback) {
          var requestUrl = '';
          requestUrl = baseUrl + '/resources/' + resourceId + '?access_token=' + authToken.token.access_token;
          request(requestUrl, function (err, response, body) {
            if(err) { console.log(err); res.send(500,"Server Error while retrieving resource skills..."); }
            var resourceDetails = {};
            var jsonResponse = JSON.parse(body);
            resourceDetails.id = jsonResponse.id;
            resourceDetails.name = jsonResponse.name;
            resourceDetails.city = getCityFromLocation(jsonResponse.job_title);
            resourceDetails.state = getStateFromLocation(jsonResponse.job_title);
            resourceDetails.manager = 'No Manager Specified';
            resourceDetails.region = 'No Region Specified';
            resourceDetails.brand = 'No Brand Specified';
            resourceDetails.email = jsonResponse.email;
            resourceDetails.skills = [];
            for (var i in jsonResponse.selected_custom_field_options) {
              var customFieldOptions = jsonResponse.selected_custom_field_options[i];
              if (customFieldOptions.name === 'Skills') {
                resourceDetails.skills.push(customFieldOptions.value);
              }
              else if (customFieldOptions.name === 'Manager') {
                resourceDetails.manager = customFieldOptions.value
              }
              else if (customFieldOptions.name === 'Region') {
                resourceDetails.region = customFieldOptions.value
              }
              else if (customFieldOptions.name === 'Brand') {
                resourceDetails.brand = customFieldOptions.value
              }
            }            
            //console.log(JSON.stringify(resourceDetails));
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
    csvPlainText = '"id","Name","Email","City","State","Brand","Manager","Region","Skill","Skill Level","Brand Level1","Brand Level2"' + "\r\n"
    for (var i in resources) {
      resource = resources[i];
      csvString = formatEngineerCsvEntry(resource);
      csvPlainText += csvString;
    }
    callback();
  }], function (err, results) {
    if(err) { console.log(err); res.render("Server Error while making resource REST calls"); return; }
    //console.log('Final callback: ' + JSON.stringify(resources));
    console.log(csvPlainText);
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

var getResourceIds = function (callback) {
  var resourceIds = [];
  var requestUrl = baseUrl + '/resources?limit=0&access_token=' + authToken.token.access_token;
  request(requestUrl, function (err, response, body) {
    if (err) {
      console.log("Error occurred while accessing RG");
      console.log(err);
      res.send(500, "Server Error while retieving resources...");
      return;
    }
    if (!body) { callback(); console.log("No body returned from Resources REST request."); return; }
    var obj = JSON.parse(body);
    for (var i in obj) {
      resourceIds.push(obj[i].id);
    }
    callback(resourceIds);
  });
}

var getClientIds = function (callback) {
  var ClientIds = [];
  var requestUrl = baseUrl + '/clients?limit=' + resourceLimit + '&access_token=' + authToken.token.access_token;
  request(requestUrl, function (err, response, body) {
    if (err) {
      console.log("Error occurred while accessing RG");
      console.log(err);
      res.send(500, "Server Error while retieving clients...");
      return;
    }
    if (!body) { callback(); console.log("No body returned from Clients REST request."); return; }
    var obj = JSON.parse(body);
    for (var i in obj) {
      var clientId = { "id": obj[i].id, "name": obj[i].name}
      ClientIds.push(clientId);
      //console.log(clientId);
    }
    callback(ClientIds);
  });
}

var rgGetUserPermissions = function (callback) {
  var users = []
  var requestUrl = baseUrl + '/users?limit=' + resourceLimit + '&access_token=' + authToken.token.access_token;
  request(requestUrl, function (err, response, body) {
    if (err) {
      console.log("Error occurred while accessing RG");
      console.log(err);
      res.send(500, "Server Error while retieving resources...");
      return;
    }
    if (!body) { callback(); console.log("No body returned from Resources REST request."); return; }
    var obj = JSON.parse(body);
    for (var i in obj) {
      var user = {};
      user.id = obj[i].id
      user.name = obj[i].email
      user.permissions = obj[i].permissions
      users.push(user);
    }
    callback(users);
  });  
}

var rgGetProjectListWithClientName = function(callback) {
  var projects = []
  var requestUrl = baseUrl + '/projects?limit=' + resourceLimit + '&access_token=' + authToken.token.access_token;
  
  getClientIds(function (clientIds) {
    request(requestUrl, function (err, response, body) {
      if (err) {
        console.log("Error occurred while accessing RG");
        console.log(err);
        res.send(500, "Server Error while retieving projects...");
        return;
      }
      if (!body) { callback(); console.log("No body returned from Projects REST request."); return; }
      var obj = JSON.parse(body);
      for (var i in obj) {
        var project = {};
        project.id = obj[i].id
        project.name = obj[i].name
        project.clientId = obj[i].client_id
        clientIds.map(function(client){
          //console.log("clientid: " + client.id);
          //console.log("clientname: " + client.name);
          if (client.id !== '' && client.id === project.clientId) {
            project.clientName = client.name;
          }
        });
        projects.push(project);
        console.log(project.name + " " + project.clientName);
      }
      callback(projects);      
    }); 
  });
}

module.exports.rgGetProjectList = function(req, res) {
      rgGetProjectListWithClientName(function(projects) {
        res.render('rgGetProjectListWithClientName', { "data":  projects});
     });
}

module.exports.rgGetCurrentPermissions = function(req, res) {
    //getResourceIds(function(resourceIds) {
    //  resourceIds.map(function (resourceId) {
      rgGetUserPermissions(function(users) {
        res.render('rgUserPermissions', { "data":  users});
     });
    //});
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