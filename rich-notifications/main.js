// Declare a variable to generate unique notification IDs
var notID = 0;

// partial URLs to the images used in the example
var asURLs = [
	"/images/inbox-64x64.png",
	"/images/inbox-08-64x64.png",
	"/images/white-64x64.png",
	"/images/africa-400x400.png",
	"/images/antartica-400x400.png",
	"/images/asia-400x400.png",
	"/images/europe-400x400.png",
	"/images/north-america-400x400.png",
	"/images/oceania-400x400.png",
	"/images/south-america-400x400.png"
];

// List of sample notifications. These are further customized 
// in the code according the UI settings.
var notOptions = [
	{
		templateType : "simple",
		title: "Simple Notification",
		message: "Just a text message and icon"
	},
	{
		templateType : "basic",
		title: "Basic Notification",
		message: "Short message part",
		expandedMessage: "Longer part of the message",
	},
	{
		templateType : "image",
		title: "Image Notification",
		message: "Short message plus an image",
	},
	{
		templateType : "list",
		title: "List Notification",
		message: "List of items in a message",
		items: [
			{ title: "Item1", message: "This is item 1"},
			{ title: "Item2", message: "This is item 2"},
			{ title: "Item3", message: "This is item 3"},
			{ title: "Item4", message: "This is item 4"},
			{ title: "Item5", message: "This is item 5"},
			{ title: "Item6", message: "This is item 6"},
		]
	}
];

// Window initialization code. Set up the various event handlers
window.addEventListener("load", function() {
	document.getElementById("simple").addEventListener("click", doNotify);
	document.getElementById("basic").addEventListener("click", doNotify);
	document.getElementById("image").addEventListener("click", doNotify);
	document.getElementById("list").addEventListener("click", doNotify);

	// set up the event listeners
	chrome.experimental.notification.onDisplayed.addListener(notificationDisplayed);
	chrome.experimental.notification.onClosed.addListener(notificationClosed);
	chrome.experimental.notification.onClicked.addListener(notificationClicked);
	chrome.experimental.notification.onButtonClicked.addListener(notificationBtnClick);
});

// Create the notification with the given parameters as they are set in the UI
function doNotify(evt) {
	var path = chrome.runtime.getURL(asURLs[document.getElementById("img").options.selectedIndex]);
	var options = null;
	var sBtn1 = document.getElementById("btn1").value;
	var sBtn2 = document.getElementById("btn2").value;
	// Create the right notification for the selected type
	if (evt.srcElement.id == "simple") {
		options = notOptions[0];
	}
	else if (evt.srcElement.id == "basic") {
		options = notOptions[1];
	}
	else if (evt.srcElement.id == "image") {
		options = notOptions[2];
		options.imageUrl = chrome.runtime.getURL("/images/tahoe-320x215.png");
	}
	else if (evt.srcElement.id == "list") {
		options = notOptions[3];
	}
	options.iconUrl = path;
	// priority is from -2 to 2. The API makes no guarantee about how notifications are
	// visually handled by the OS - they simply represent hints that the OS can use to 
	// order or display them however it wishes.
	options.priority = document.getElementById("pri").options.selectedIndex - 2;

	options.buttons = [];
	if (sBtn1.length)
		options.buttons.push({ title: sBtn1 });
	if (sBtn2.length)
		options.buttons.push({ title: sBtn2 });
		
	chrome.experimental.notification.create("id"+notID++, options, creationCallback);
}

function creationCallback(notID) {
	console.log("Succesfully created " + notID + " notification");
}

// Event handlers for the various notification events
function notificationDisplayed(notID) {
	console.log("The notification '" + notID + "' was displayed to the user");
}

function notificationClosed(notID, bByUser) {
	console.log("The notification '" + notID + "' was closed" + (bByUser ? " by the user" : ""));
}

function notificationClicked(notID) {
	console.log("The notification '" + notID + "' was clicked");
}

function notificationBtnClick(notID, iBtn) {
	console.log("The notification '" + notID + "' had button " + iBtn + " clicked");
}
