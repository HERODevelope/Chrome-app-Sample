/**
 * API which opens the sockets and handles sending the data to
 * and receiving the data from the AR Drone
 *
 * Additional thanks to Felix Geisendörfer (felixge) for the Node AR Drone lib
 * which served as a helpful reference.
 *
 * @see https://github.com/felixge/node-ar-drone
 */
var DRONE = DRONE || {};
DRONE.API = (function() {

  var SIMULATE = false;

  // Constants
  var TO_DRONE = 0;
  var TO_CLIENT = 1;
  var DRONE_IP = "192.168.1.1";
  var CLIENT_IP = "192.168.1.2";
  var ONE_BUFFER = DRONE.Util.uint8ToArrayBuffer(1);
  var TAKEOFF = 290718208; // 512
  var LAND = 290717696; // 0
  var COMMANDS_ENABLED = 1;

  // Vars
  var noop = function() {};
  var keepAliveTimeout = 0;
  var CONNECTIONS = 3;
  var connectionsOutstanding = CONNECTIONS;
  var sockets = {
    "nav": {
      protocol: "udp",
      port: 5554,
      socket: null,
      type: 'bind',
    },
    "vid": {
      protocol: "tcp",
      port: 5555,
      socket: null,
      type: 'connect',
    },
    "at": {
      protocol: "udp",
      port: 5556,
      socket: null,
      type: 'bind',
    },
    "cmd": { // FIXME: what's purpose of this socket?
      protocol: "udp",
      port: 5559,
      socket: null,
      type: 'connect',
    }
  };
  var status = {
    verticalSpeed: 0,
    angularSpeed: 0,
    leftRightTilt: 0,
    frontBackTilt: 0,
    enabled: 0,
    mode: LAND
  };

  callbacks = {

    /**
     * Called whenever one of our sockets has connected
     */
    onConnected: function(connectionResult) {

      // if we have 0 or higher we're good
      if(connectionResult >= 0) {

        connectionsOutstanding--;

        // if we're all done with our connecting
        if(connectionsOutstanding === 0 && callbacks.onAllConnected) {

          // start sending commands
          sendKeepAliveCommand();
          sendFlatTrim();
          sendSensitivity();

          // set this to true if you're flying outdoors
          sendOutdoor(false);

          // now enable controls
          status.enabled = COMMANDS_ENABLED;

          if(callbacks.onAllConnected) {
            callbacks.onAllConnected();
          }
        }

      } else {
        // Flag that there was an issue
        if(callbacks.onConnectionError) {
          callbacks.onConnectionError();
        }
      }
    },

    /**
     * Called whenever one of our udp sockets receive messages
     */
    onReceive: function(info) {
      if (info.remotePort == 5554) {
        if(info.data.byteLength > 0) {
          DRONE.NavData.parse(info.data);
        } else {
          shutdown();
        }
      } else if (info.remotePort == 5556) {
        console.log("at socket receive data of size:" + info.data.byteLength);
      } else if (info.remotePort == 5559) {
        console.log("cmd socket receive data of size:" + info.data.byteLength);
      } else {
        console.log("unexpected data are received by port:" + info.remotePort);
      }
    },

    onReceiveError: function(info) {
      console.log("network in trouble socketId:" + info.socketId + " resultCode:" + info.resultCode);
      shutdown();
    },

    /* Placeholder callbacks */
    onAllConnected: null,
    onConnectionError: null
  };

  // -- Bootstrap

  function bootstrapClientIp() {
    // double check the Client IP (sometimes the Drone assignes 192.168.1.3)
    chrome.socket.getNetworkList(function(entries) {
      if (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i] && entries[i].address
            && entries[i].address.indexOf("192.168.1.") == 0) {
            if (CLIENT_IP != entries[i].address) {
              CLIENT_IP = entries[i].address;
              log("Client IP changed to "+CLIENT_IP);
            }
            connectDrone();
            return;
          }
        }
      }
      callbacks.onConnectionError();
    });
  }

  /**
   * Initialises client IP
   */
  function init(cbConnected, cbConnectionError) {
    if (sockets['at'].socket != null) {
      return;
    }
    bootstrapClientIp();

    // assign the callbacks
    callbacks.onAllConnected = cbConnected;
    callbacks.onConnectionError = cbConnectionError;
  }

  /**
   * Initialises the connections to the Drone
   */
  function connectDrone() {
    // send the drone AT commands
    connect(sockets['at']);

    // get navigation data from the drone
    connect(sockets['nav']);

    // get a video stream from the drone
    // TODO: connect(sockets['vid'], 'tcp');

    // send admin commands to the drone
    connect(sockets['cmd']);
    log("connection completed.");
  }


  /**
   * Closes and discards all the socket connections
   */
  function shutdown() {
    try {
    connectionsOutstanding = CONNECTIONS;
    if (keepAliveTimeout) clearTimeout(keepAliveTimeout);
    status.mode = LAND;
    status.enabled = 0;
    disconnect(sockets['at']);
    disconnect(sockets['nav']);
    disconnect(sockets['cmd']);
  } catch (err) {
    sockets['at'].socket = null;
    sockets['nav'].socket = null;
    sockets['cmd'].socket = null;
  }
    log("disconnected. push A to reconnect");
    // TODO: disconnect(sockets['vid'].socket);
  }

  /**
   * Creates and connects a socket connection
   *
   * @see http://developer.chrome.com/apps/socket.html
   */
  function connect(sockRef) {

    // grab the protocol, type, port and IP from
    // the sockRef passed in and use that
    // to create the socket
    if (SIMULATE) {
      callbacks.onConnected(1);
    } else {
      if (sockRef.protocol === "tcp") {
        chrome.sockets.tcp.create({}, function(createInfo) {
          sockRef.socket = createInfo.socketId;
          chrome.sockets.tcp.connect(sockRef.socket,
            DRONE_IP,
            sockRef.port,
            callbacks.onConnected);
        });
      } else if (sockRef.protocol === "udp") {
        chrome.sockets.udp.create({}, function(createInfo) {
          sockRef.socket = createInfo.socketId;
          chrome.sockets.udp.onReceive.addListener(callbacks.onReceive);
          chrome.sockets.udp.onReceiveError.addListener(callbacks.onReceiveError);
          chrome.sockets.udp.bind(sockRef.socket,
            CLIENT_IP, sockRef.port, callbacks.onConnected);
        });
      }
    }
  }

  /**
   * Disconnects and destroys the socket connection
   */
  function disconnect(sockRef) {
    if (!SIMULATE) {
      if (sockRef.protocol === "tcp") {
        chrome.sockets.tcp.disconnect(sockRef.socket, function(result) {
          chrome.sockets.tcp.close(sockRef.socket, noop);
          sockRef.socket = null;
        });
      } else if (sockRef.protocol === "udp") {
        chrome.sockets.udp.close(sockRef.socket, noop);
        sockRef.socket = null;
      }
    }
  }

  // -- Stream functions

  /**
   * Converts an array of commands to a string and then
   * an ArrayBuffer to send over the socket to the drone
   */
  function sendCommands(commands) {
    var atSock = sockets['at'];
    var commandBuffer = DRONE.Util.stringToArrayBuffer(commands.join(""));

    // output the commands
    log(commands.join("")+"   "+JSON.stringify(status));

    // send all the commands
    if (!SIMULATE) {
      try {
        chrome.sockets.udp.send(
          atSock.socket,
          commandBuffer,
          DRONE_IP,
          atSock.port,
          function(sendInfo) {
            if (sendInfo.resultCode < 0) {
              shutdown();
            }
          });
      } catch(err) {
        shutdown();
      }
    }
  }

  /**
   * Helper function we use before letting the drone take off
   * that we use to let it know that it's horizontal
   */
  function sendFlatTrim() {
    sendCommands([new DRONE.Command('FTRIM')]);
  }

  /**
   * Helper function that tells the drone what sensitivity
   * we want. This is quite a high value (min = 0, max = 0.52)
   */
  function sendSensitivity() {
    sendCommands([
      new DRONE.Command('CONFIG', ['"control:euler_angle_max"', '"0.11"']),
      new DRONE.Command('CONFIG', ['"control:indoor_euler_angle_max"', '"0.11"']),
      new DRONE.Command('CONFIG', ['"control:outdoor_euler_angle_max"', '"0.11"'])
    ]);
  }

  /**
   * Informs the drone that it is going to be flying outdoors
   */
  function sendOutdoor(outdoor) {
    sendCommands([new DRONE.Command('CONFIG', ['"control:outdoor"', '"'+(outdoor?'TRUE':'FALSE')+'"'])]);
  }

  /**
   * Sends a keepalive command and attempts to read
   * back the latest data from the drone
   */
  function sendKeepAliveCommand() {
    var navSock = sockets['nav'];
    if (!SIMULATE) {
      try {
        chrome.sockets.udp.send(
          navSock.socket,
          (new Uint8Array([1])).buffer,
          DRONE_IP,
          navSock.port,
          function(sendInfo) {
            if (sendInfo.resultCode < 0) {
              shutdown();
            }
          });
      } catch(err) {
        shutdown();
      }

    }

    // set up a keepalive just in case we don't
    // for whatever reason send the other commands
    if (keepAliveTimeout) clearTimeout(keepAliveTimeout);
    keepAliveTimeout = setTimeout(sendKeepAliveCommand, 1000);
  }

  var takeoffLandStart = 0;
  var previousTakeoffStatus = LAND;

  /**
   * The takeoff loop. This should keep sending the REF command until the 
   * navdata shows that it has taken off, but since we don't yet interpret navdata,
   * let's just keep it doing this for four seconds.
   */
  function takeOffOrLand() {

    if (!takeoffLandStart || previousTakeoffStatus!=status.mode) {
      takeoffLandStart = Date.now();
      previousTakeoffStatus=status.mode;
    } else {
      // five seconds
      if (takeoffLandStart+5000<Date.now()) {
        takeoffLandStart=0;
        loop();
        return;
      }
    }

    commands = [
      // Take off
      new DRONE.Command('REF', [
        status.mode
      ])

    ];

    // send and reschedule
    sendCommands(commands);
    setTimeout(takeOffOrLand, 500);
  }

  /**
   * The main loop. This sends the commands to the drone, including
   * the tilt, speed and whether or not we want it to take off or land
   */
  function loop() {
    if (takeoffLandStart != 0) {
      return;
    }
    if (status.mode == LAND) {
      return;
    }

    commands = [

      // Take off
      new DRONE.Command('REF', [
        status.mode
      ]),

      new DRONE.Command('PCMD', [

        // Enables/Disables commands
        status.enabled,

        // Left - Right tilt
        DRONE.Util.float32ToInt32(status.leftRightTilt),

        // Front - Back tilt
        DRONE.Util.float32ToInt32(status.frontBackTilt),

        // Vertical Speed
        DRONE.Util.float32ToInt32(status.verticalSpeed),

        // Angular Speed
        DRONE.Util.float32ToInt32(status.angularSpeed)

      ])
   ];

    // send and schedule the update
    sendCommands(commands);

    setTimeout(loop, 60);
  }

  // -- Actions

  function takeOff() {
    status.mode = TAKEOFF;
    if (takeoffLandStart == 0) {
      takeOffOrLand();
    }
  }

  function land() {
    status.mode = LAND;
    if (takeoffLandStart == 0) {
      takeOffOrLand();
    }
  }

  function raiseLower(val) {
    val = check(val, 0);
    status.verticalSpeed = val;
  }

  function tiltLeftRight(val) {
    val = check(val, 0);
    status.leftRightTilt = val;
  }

  function tiltFrontBack(val) {
    val = check(val, 0);
    status.frontBackTilt = val;
  }

  function rotateLeftRight(val) {
    val = check(val, 0);
    status.angularSpeed = -val;
  }

  /**
   * Resets all values to zero
   */
  function allStop() {
    status.angularSpeed = 0;
    status.verticalSpeed = 0;
    status.frontBackTilt = 0;
    status.leftRightTilt = 0;
  }

  function check(val, defaultVal) {
    if(typeof val === "undefined") {
      val = defaultVal;
    }
    return val;
  }

  return {
    init: init,
    takeOff: takeOff,
    land: land,
    raiseLower: raiseLower,
    tiltLeftRight: tiltLeftRight,
    tiltFrontBack: tiltFrontBack,
    rotateLeftRight: rotateLeftRight,
    allStop: allStop,
    shutdown: shutdown
  };

})();
