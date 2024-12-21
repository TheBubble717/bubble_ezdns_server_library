import { dnsserverclass, dnsPacket } from './../dnsserver.js'
var port = 53;

class dnsclass {
  constructor() {
    this.server = null;
  }

  createserver(callback) {
    var that = this;
    return new Promise(async (resolve, reject) => {
      that.server = new dnsserverclass({
        "type": "tcp4",
        "port": port,
        "address": "0.0.0.0",
        "handle": (request, responseclass) =>
          that.dnshandler(request, responseclass)
      })
      that.server.createserver()

      that.server.server.on('listening', async function () {
        var answer = "Dns-Server was started successfull and is listening on Port: " + port
        if (callback && typeof callback == 'function') {
          await callback("", answer);
          resolve();
        }
        else {
          resolve(answer);
        }
        return;
      });

      that.server.server.on('close', async function () {
        var error = "DNS-Server closed, killing program"
        if (callback && typeof callback == 'function') {
          await callback(error, "");
          resolve();
        }
        else {
          reject(error);
        }

        process.abort()
      });

      that.server.server.on('request', (request) => {
        //console.log(request)
      });

      that.server.listen()


    });
  }

  async dnshandler(request, responseclass) {
    const [question] = request.questions;

    if(question.type == "A")
    {
      var dataresponse = ["8.8.8.8"]
    }
    else
    {
      var dataresponse = []
    }
    
    var response = { "type": question.type, "data": dataresponse, "dnsflags": dnsPacket.AUTHORITATIVE_ANSWER }

    var replyvariable = []
    if (typeof response.data !== "undefined") {
      for (let i = 0; i < response.data.length; i++) {
        replyvariable.push({
          name: question.name,
          type: response.type,
          class: 'IN',
          ttl: 120,
          data: response.data[i]
        });
      }
    }

    await responseclass.send(replyvariable, response.dnsflags).catch(function (err) { console.log("Error sending Answer: "+err)});

    if ((question.type == "SOA") || (question.type == "CAA") || (question.type == "MX")) {
      var formattingofresponse = JSON.stringify(response.data)
    } else {
      var formattingofresponse = response.data.toString()
    }
    console.log(`Who:${responseclass.rinfo.address} ----- Domain:${question.name}  ----- Flags:${response.dnsflags}  ----- Type:${question.type} --> ${formattingofresponse}`);
  }

}


var dnsserver = new dnsclass()
dnsserver.createserver(async function (err, res) {
  if (err) {
    console.log(err)
    process.exit()
  }
  console.log(res)
});