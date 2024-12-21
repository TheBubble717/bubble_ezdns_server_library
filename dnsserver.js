import { createRequire } from "module"
import dgram from 'node:dgram';
import net from 'node:net'
const require = createRequire(import.meta.url)
const dnsPacket = require('dns-packet');


class dnsserverclass {
    constructor(dnsconfig) {
        this.config = dnsconfig;
        this.server = null
        this.handle = dnsconfig.handle;
    }

    createserver() {
        var that = this;

        if ((that.config.type == "tcp6") || (that.config.type == "udp6")) {
            throw new Error(`${that.config.type} is not implemented yet`)
        }

        if (that.config.type == "udp4") {
            that.server = dgram.createSocket('udp4');

            that.server.on('error', (err) => {
                console.error(`server error:\n${err.stack}`);
                that.server.close();
            });

            // Handle incoming data
            that.server.on('message', (msg, rinfo) => {
                try {
                    var request = dnsPacket.decode(msg)
                    that.handle(request, new responseclass(request, rinfo, that.server, that.config))
                }
                catch (err) { console.log("Packet not decodeable: " + err) }

            });
            return;
        }

        if (that.config.type == "tcp4") {

            that.server = net.createServer((socket) => {

                // Handle incoming data
                socket.on('data', (buffer) => {
                    let rinfo = {
                        "address": socket.remoteAddress,
                        "port": socket.remotePort,
                        "family": socket.remoteFamily,
                    }
                    try {
                        // Read the 2-byte length prefix
                        const messageLength = buffer.readUInt16BE(0);
                        const dnsMessage = buffer.slice(2, 2 + messageLength);
                        const request = dnsPacket.decode(dnsMessage);
                        that.handle(request, new responseclass(request, rinfo, socket, that.config))
                    }
                    catch (err) { console.log("Packet not decodeable: " + err) }
                });

                socket.on('end', () => {
                });
            
                socket.on('error', (err) => {
                });


            });

            that.server.on('error', (err) => {
                throw err;
            });
            return;
        }

        throw new Error(`Protocol ${that.config.type} is unknown, try tcp4,tcp6,udp4 or udp6`)
    }

    listen() {
        if (this.config.type == "udp4") {
            this.server.bind({ address: this.config.address, port: this.config.port, exclusive: true, })
        }
        else if (this.config.type == "tcp4") {
            this.server.listen(this.config.port, this.config.address, () => {

            });
        }
    }
}


/*
config:{
    type:"udp4" or "upd6" or "tcp4" or "tcp6"
    port:
    address: "0.0.0.0"
    handle: (request, responseclass) =>
        handler(request, responseclass)
}
*/


class responseclass {
    constructor(request, rinfo, server, config) {
        this.request = request
        this.rinfo = rinfo
        this.server = server
        this.config = config
    }

    send(answers, dnsflags) {
        var that = this;
        return new Promise(async (resolve, reject) => {
            try {

                // Process answers to split TXT records if necessary
                const processedAnswers = answers.map(answer => {
                    if (answer.type === 'TXT' && typeof answer.data === 'string') {
                        answer.data = Array.from({ length: Math.ceil(answer.data.length / 255) },
                            (_, i) => answer.data.slice(i * 255, (i + 1) * 255));
                    }
                    return answer;
                });

                // Prepare the EDNS0 OPT record
                const optRecord = {
                    type: 'OPT',
                    name: '.', // Root domain
                    udpPayloadSize: 4096,
                    extendedRcode: 0,
                    ednsVersion: 0,
                    flags: 0,
                    data: Buffer.alloc(0),
                };

                var response = dnsPacket.encode({
                    type: 'response',
                    id: that.request.id,
                    flags: dnsflags,
                    questions: that.request.questions,
                    answers: processedAnswers,
                    additionals: [optRecord],
                })

                if (that.config.type == "tcp4") {

                    // Add the 2-byte length prefix to the response
                    const responseLength = Buffer.alloc(2);
                    responseLength.writeUInt16BE(response.length);
                    that.server.write(Buffer.concat([responseLength, response]))
                        .then(() => 
                            console.log("orks"),
                            resolve(`Sent response to ${that.rinfo.address}:${that.rinfo.port}`))
                        .catch((err) => 
                            console.log("not works"),
                            reject(`Error sending response to ${that.rinfo.address}:${that.rinfo.port}: ${err}`))
                }
                else if (that.config.type == "udp4") {

                    that.server.send(response, that.rinfo.port, that.rinfo.address, (err) => {
                        if (err) {
                            reject(`Error sending response to ${that.rinfo.address}:${that.rinfo.port}: ${err}`);
                        } else {
                            resolve(`Sent response to ${that.rinfo.address}:${that.rinfo.port}`);
                        }
                    });
                    return;
                }
                else
                {
                    reject(`Connection not supported!`);
                    return;
                }

            }
            catch (err) {
                reject(err)
            }

        });
    }
}


export { dnsserverclass, dnsPacket }