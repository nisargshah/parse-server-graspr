// Remove duplicate installation based on unique user pointer
Parse.Cloud.beforeSave(Parse.Installation, function(request, response) {
  if(request.user){
    console.log("User exists in request object - Checking for duplicate installation..");
    //Parse.Cloud.useMasterKey();
    var query = new Parse.Query(Parse.Installation);
    query.equalTo("user", request.user);
    // query.equalTo("uniqueID", request.object.get("uniqueID"));
    query.first({ useMasterKey: true }).then(function (duplicate) {
      if (typeof duplicate === "undefined") {
        console.log("Duplicate does not exist,New installation");
        response.success();
      } else {
        console.log("Duplicate exist..Trying to delete " + duplicate.id);
        duplicate.destroy().then(function (duplicate) {
          console.log("Successfully deleted duplicate");
          response.success();
        }, function () {
          console.log(error.code + " " + error.message);
          response.success();
        });

      }
    }, function (error) {
      console.warn(error.code + error.message);
      response.success();
    });
  }
  else{
    console.log("No user found in request.");
    response.success();
  }
});

Parse.Cloud.afterDelete("Grasped", function(request) {
  var query = new Parse.Query("Activity");
  query.equalTo("graspPost", {__type: "Pointer",className: "Grasped",objectId: request.object.id});
  // query.equalTo("graspPost", request.object.id);
  query.find().then(function(activities) {
    return Parse.Object.destroyAll(activities);
  }).then(function(success) {
    console.log("Successfully deleted related activities.");
  }, function(error) {
    console.error("Error deleting related activities " + error.code + ": " + error.message);
  });
});

// Validate Grasp posts have a valid owner in the "user" pointer.
Parse.Cloud.beforeSave('Grasped', function(request, response) {
  var currentUser = request.user;
  var objectUser = request.object.get('User');

  if(!currentUser || !objectUser) {
    response.error('A Graspr should have a valid user.');
  } else if (currentUser.id === objectUser.id) {
    response.success();
  } else {
    response.error('Cannot set user on Graspr to a user other than the current user.');
  }
});

Parse.Cloud.beforeSave('Activity', function(request, response) {
  var currentUser = request.user;
  var objectUser = request.object.get('fromUser');

  if(!currentUser || !objectUser) {
    response.error('An Activity should have a valid fromUser.');
  } else if (currentUser.id === objectUser.id) {
    response.success();
  } else {
    response.error('Cannot set fromUser on Activity to a user other than the current user.');
  }
});

Parse.Cloud.afterSave('Activity', function(request) {
  // Only send push notifications for new activities
  if (request.object.existed()) {
    return;
  }

  var toUser = request.object.get("toUser");
  if (!toUser) {
    throw "Undefined toUser. Skipping push for Activity " + request.object.get('type') + " : " + request.object.id;
  }
  if (toUser.id == request.object.get('fromUser').id) {
    throw "Not creating push since activity created for the user itself.";
  }
  var query = new Parse.Query(Parse.Installation);
  query.equalTo('user', toUser);

  Parse.Push.send({
    where: query, // Set our Installation query.
    data: alertPayload(request)
  }).then(function() {
    // Push was successful
    console.log('Sent push.');
  }, function(error) {
    throw "Push Error " + error.code + " : " + error.message;
  });
});

var alertMessage = function(request) {
  var message = "";

  if (request.object.get("activityType") === "addsToList") {
    if (request.user.get('username')) {
      message = request.user.get('username') + ' shared your grasp.';
    } else {
      message = "Someone added your grasp to their list.";
    }
  } else if (request.object.get("activityType") === "likes") {
    if (request.user.get('username')) {
      message = request.user.get('username') + ' likes your grasp.';
    } else {
      message = 'Someone likes your grasp.';
    }
  } else if (request.object.get("activityType") === "follows") {
    if (request.user.get('username')) {
      message = request.user.get('username') + ' is now following you.';
    } else {
      message = "You have a new follower.";
    }
  }

  // Trim our message to 140 characters.
  if (message.length > 140) {
    message = message.substring(0, 140);
  }

  return message;
};

var alertPayload = function(request) {
  var payload = {};

  if (request.object.get("activityType") === "addsToList") {
    return {
      "alert": alertMessage(request), // Set our alert message.
      // The following keys help load the correct post in response to this push notification.
      "p": 'a', // Payload Type: Activity
      "activityType": 'addsToList', // Activity Type: addsToList
      "graspPost": request.object.id,
      "fromUser": request.object.get('fromUser').id // From User
    };
  } else if (request.object.get("activityType") === "likes") {
    return {
      "alert": alertMessage(request), // Set our alert message.
      // The following keys help load the correct post in response to this push notification.
      "p": 'a', // Payload Type: Activity
      "activityType": 'likes', // Activity Type: Like
      "graspPost": request.object.id,
      "fromUser": request.object.get('fromUser').id // From User
    };
  } else if (request.object.get("activityType") === "follows") {
    return {
      "alert": alertMessage(request), // Set our alert message.
      // The following keys help load the correct post in response to this push notification.
      "p": 'a', // Payload Type: Activity
      "activityType": 'follows', // Activity Type: Follow
      "graspPost": request.object.id,
      "fromUser": request.object.get('fromUser').id // From User
    };
  }
};