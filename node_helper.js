/*MIT License
This project is based on https://github.com/ottopaulsen/MMM-NesteBussAtB, modify by Quentin Delahaye.

Copyright (c) 2018 Otto Paulsen


Copyright (c) https://github.com/ottopaulsen/MMM-NesteBussAtB

Copyright (c) 2019 Quentin Delahaye


Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var NodeHelper = require("node_helper");
var request = require('request');
var convert = require('xml-js');
var https = require('https');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var jsdom = require("jsdom").JSDOM;
var DOMParser = require('xmldom').DOMParser;
var xpath = require("xml2js-xpath");
var xml2js = require("xml2js");

module.exports = NodeHelper.create({

    start: function () {
        console.log(this.name + ': Starting node helper');
    },

    socketNotificationReceived: function (notification, payload) {
        console.log(this.name + ': Received socket notification ' + notification);
        var self = this;
        var buses = new Map();
        if (notification == 'NESTEBUSSATB_CONFIG') {
            console.log(self.name + ': AtB Connection started');

            self.readBuses(payload, buses);
            setInterval(function () {
                self.readBuses(payload, buses);
            }, 60000);
        }
    },

    readBuses: function (config, buses) {
        var self = this;
        stops = config.stopIds;
        stops.forEach(function (stopId) {
            var stopBuses = [];
            console.log("readBuses");
            self.getAtbStopTimes(config, stopId, function (error, data) {
                if (!error) {
                    var routes = new Map();
		    console.log("stopId=" + stopId);
		    console.log("data.buses.length=" + data.buses.length);

                    for (i = 0; i < data.buses.length; i++) {
                        var bus = data.buses[i];
                        var key = bus.line.trim() + bus.name.trim();
                        var routeCount = routes.has(key) ? routes.get(key) : 0;
                        var minutes = bus.time;// Math.round((self.toDate(bus.time) - (new Date())) / 60000);
			//console.log("bus.time.trim()= " + self.toDate(bus.time));
                        if (routeCount < config.maxCount) {
                            routeCount++;
                            routes.set(key, routeCount);
				console.log("push newstopbus " + bus.time);

                            stopBuses.push({
                                number: bus.line.trim(),
                                from: bus.name.trim(),
                                to: bus.destination.trim(),
                                time: bus.time//.trim()
                            });
                        }
                    }
                    buses.set(stopId, stopBuses);
                    self.broadcastMessage(buses);
                } else {
                    console.error(self.name + ': Request error: ' + error);
                }
            });
		console.log("END readBuses");
        });
    },

    broadcastMessage: function (buses) {
        self = this;
        busArr = [];
        buses.forEach(function (stop) {
            stop.forEach(function(bus) {
                busArr.push(bus);
            });
        });
        //busArr.sort(function (a, b) {
       //     return (self.toDate(a.time) - self.(b.time));
       // });
        filteredBuses = busArr.filter(function (el, i, a) {
            return !self.duplicateBuses(el, a[i - 1]); // Seems that some times AtB returns duplicated buses
        });
        self.sendSocketNotification('BUS_DATA', filteredBuses);
    },

    printBuses(label, b) {
        console.log(label);
        for (i = 0; i < b.length; i++) {
            console.log('Bus ' + i + ': Line ' + b[i].number + ' from ' + b[i].from + ' to ' + b[i].to + ' time ' + b[i].time);
        }
    },

    duplicateBuses: function (a, b) {
        if (!a) return false;
        if (!b) return false;
        if (a.number != b.number) return false;
        if (a.from != b.from) return false;
        if (a.to != b.to) return false;
        if (a.time != b.time) return false;
        return true;
    },

    toDate: function (s) {
        year = s.substring(0, 4);
        month = parseInt(s.substring(5, 7)) - 1;
        day = s.substring(8, 10);
        hour = s.substring(11, 13);
        minute = s.substring(14, 16);
        time = new Date(year, month, day, hour, minute, 0, 0);
        return time;
    },

    createAtbSmsXml: function (config, stopId) {
        var currentTime = new Date();
        var requestTime = currentTime.getFullYear() + '-'
            + (((currentTime.getMonth() + 1) < 10) ? '0' : '')
            + (currentTime.getMonth() + 1) + '-'
            + ((currentTime.getDate() < 10) ? '0' : '')
            + currentTime.getDate() + 'T'
            + ((currentTime.getHours() < 10) ? '0' : '')
            + currentTime.getHours() + ':'
            + ((currentTime.getMinutes() < 10) ? '0' : '')
            + currentTime.getMinutes() + ':'
            + ((currentTime.getSeconds() < 10) ? '0' : '')
            + currentTime.getSeconds() + '.'
            + currentTime.getMilliseconds() + 'Z';
        var requestor = 'github.com/ottopaulsen/MMM-NesteBussAtB';
        var previewInterval = 'PT' + config.maxMinutes + 'M';
        var xml = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:siri="http://www.siri.org.uk/siri">
        <soapenv:Header/>
        <soapenv:Body>
            <siri:GetStopMonitoring>
                <ServiceRequestInfo>
                    <siri:RequestTimestamp>` + requestTime + `</siri:RequestTimestamp>
                    <siri:RequestorRef>` + requestor + `</siri:RequestorRef>
                </ServiceRequestInfo>
                <Request version="1.4">
                    <siri:RequestTimestamp>` + requestTime + `</siri:RequestTimestamp>
                    <siri:PreviewInterval>` + previewInterval + `</siri:PreviewInterval>
                    <siri:MonitoringRef>` + stopId + `</siri:MonitoringRef>
                </Request>
                <RequestExtension></RequestExtension>
            </siri:GetStopMonitoring>
        </soapenv:Body>
        </soapenv:Envelope>
        `;
        return xml;
    },
	
   
    getAtbStopTimes: function (config, stopId, handleResponse) {
        var self = this;

        var xmlhttp = new XMLHttpRequest();
         xmlhttp.onreadystatechange = function() {
             err = 0;
             result = {
                timestamp: '',
                buses: []
              }
          if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {

		result.timestamp = Date.now() ;
		parser = new DOMParser();
		textHtml = xmlhttp.responseText;
		textHtml = textHtml.replace(
		"<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\">",
		"");

	
		position = 0;
		var textHtmlOrigin = textHtml;
		var stationName = self.getAllBusStation(textHtml);
		console.log("stationName = " + stationName );
		self.getAllBusHoraire(textHtmlOrigin , result, position, stationName  );
              
		handleResponse(err, result);
          } 

          
         };

         xmlhttp.open("GET", stopId, true);
         xmlhttp.send();


     },
 getAllBusHoraire: function (textHtmlOrigin, result, position, stationName  ) {
	var self = this;
		textHtml = textHtmlOrigin;
		var positionInAllHtml = textHtml.indexOf("<div class=\"horaires-bus\">", position);
		// On sort de la fonction si il n'y a pas de bus à afficher
		if(positionInAllHtml === -1) return;

		console.log("positionInAllHtml : " + positionInAllHtml );
	        textHtml = textHtml.substr(positionInAllHtml );
		var position = textHtml.indexOf("</div>", 0);
		position = textHtml.indexOf("</div>", position  + 1);
		

		position = position  + 6; // Add "</div>" element size.
		textHtml = textHtml.substr(0, position);
		//console.log("textHtml: " + textHtml);

                var title = "";
		var direction  = "";
		var time  = new Array ();
		time[0] = "Pas de Bus";
		xml2js.parseString(textHtml , function(err, json) {
			//console.log("err: " + err);
			//if(err != 0 ) console.log("error not null");
			if(err !== null ) return;

 			//if(err != 0) return;
 			 // find the first element, and get its id:
 			 title  = xpath.evalFirst(json, "//img", "title");
 			console.log("json: " + json);
			direction = (xpath.find(json,"//span[@class='direction bold']"))[0]["_"];
			hours = (xpath.find(json,"//span"))[2];
				//console.log(hours["span"]);
			var itrHour = 0;
			for(var i = 0; i <hours["span"].length; i++) {
				if( hours["span"][i]["$"]["class"] == "horaires-bold")
				{
					time[itrHour] = hours["span"][i]["_"];
					itrHour  ++;
				}
	     		  }
		});
		//console.log("time[0] = " + time[0]);
		var timePrint = time[0] ;
		if(time.length == 1)
		{
			//timePrint  = timePrint + " - " +"Pas plus";
		}
		else
		{
			timePrint = time[0] + " - " + time[1];
		}

		 result.buses.push( {
                                line: title ,
                                destination: direction ,
                                time: timePrint ,
                                name: stationName  
                            });

		if(textHtmlOrigin.indexOf("<div class=\"horaires-bus\">", positionInAllHtml + 20) != -1)
		{
			console.log("positionInAllHtml + 1 : " + positionInAllHtml );
			// Fonction réciproque
			self.getAllBusHoraire(textHtmlOrigin, result, positionInAllHtml + 20, stationName  );
		}

	},

 getAllBusStation: function (textHtmlOrigin) {
	var stationName = "";
	textHtml = textHtmlOrigin;
	var position = textHtml.indexOf("<div class=\"header-sd-default header_title\">", 0);
	textHtml = textHtml.substr(position);
	position = textHtml.indexOf("</div>", 0);
	position = position  + 6; // Add "</div>" element size.
	textHtml = textHtml.substr(0, position);

	//console.log("stationName : " + textHtml );
	
	xml2js.parseString(textHtml , function(err, json) {
 		stationName = (xpath.find(json,"//span[@class='header-sd-title']"))[0]["_"];
	});
console.log("stopName = " + stationName );

	return stationName ;

}

});