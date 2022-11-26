const escpos = require('escpos');
const moment = require('moment');
const mqtt = require('mqtt');
const fse = require('fs-extra');
const fs = require('fs');
const _ = require('lodash');
const { Reader } = require('@tanjaae/thaismartcardreader')
const path = require('path')

var notifyServer;
var notifyUser;
var notifyPassword;
var CLIENT;
var printerId;
log('########### Q4U PRINTER NETWORK ###########');


fse.readJson('./config.json')
    .then(json => {
        notifyServer = json.notify.notifyServer
        notifyUser = json.notify.notifyUser;
        notifyPassword = json.notify.notifyPassword;
        printerId = json.printerId;
        if (notifyServer && notifyUser && notifyPassword && printerId) {
            start();
        } else {
            log(`[ERROR] Config file failed.`);
        }
    }).catch(err => {
        log(err);
    })



function log(text, log = true) {
    var _text = `${moment().format('HH:mm:ss')} - ${text}`;
    fs.appendFileSync('./log.log', `${_text}\n`);
    if (!log) {
        fs.appendFileSync('./error_log.log', `${_text}\n`);
    }
    console.log(_text);
}

function start() {
    if (printerId && notifyServer) {
        const TOPIC = `/printer/${printerId}`;
        CLIENT = mqtt.connect('mqtt://' + notifyServer, {
            username: notifyUser,
            password: notifyPassword
        });

        CLIENT.on('connect', function () {
            CLIENT.subscribe(TOPIC, function (err) {
                if (!err) {
                    log(`[MQTT] Connect Success.`);
                } else {
                    log(`[MQTT] Connect Failed. ${err}`, false);
                    CLIENT.end();
                }
            })
        });

        CLIENT.on('message', function (topic, message) {
            var message = message.toString();
            if (message) {
                try {
                    var json = JSON.parse(message);
                    var queue = json;
                    if (queue.printIdCard) {
                        printCID2();
                    } else if (queue) {
                        printQueue(queue);
                    } else {
                        log(`[ERROR] Queue not found.`, false);
                    }
                } catch (error) {
                    log(`[ERROR] Can't receive message.`, false);
                }
            } else {
                log(`[ERROR] Invalid topic.`, false);
            }
        });

        CLIENT.on('close', function () {
            log(`[ERROR] Connection closed.`, false)
        });

        CLIENT.on('error', function () {
            log(`[ERROR] Connection error.`, false)
        });

        CLIENT.on('offline', function () {
            log(`[ERROR] Connection offline.`, false)
        });

    } else {
        log('[ERROR] เกิดข้อผิดพลาด กรุณาระบุ Printer ID', false);
    }
}

async function printQueue(queue) {
    try {
        const device = new escpos.USB();
        if (device) {
            const printer = new escpos.Printer(device);
            if (queue) {
                const printSmallQueue = queue.printSmallQueue || 'N';
                const hosname = queue.hosname;
                const queueNumber = queue.queueNumber;
                const servicePointName = queue.servicePointName;
                const remainQueue = queue.remainQueue || 0;
                const priorityName = queue.priorityName;
                const qrcode = queue.qrcode;
                const queueInterview = queue.queueInterview;
                const hn = queue.hn;
                const firstName = queue.firstName;
                const lastName = queue.lastName;
                const authenCode = queue.authenCode;

                const dateTime = moment().locale('th').format('DD MMM YYYY HH:mm:ss');

                device.open(function () {

                    printer
                        .model('qsprinter')
                        .align('ct')
                        .encode('tis620');

                    if (printSmallQueue === 'Y') {
                        printer
                            .size(2, 1)
                            .text(hosname)
                            .text('')
                            .text(servicePointName)
                            .text('')
                            .size(1, 1)
                            .text('ลำดับที่')
                            .text('')
                            .size(3, 3)
                            .text(queueNumber)
                            .size(2, 1)
                            .text('')
                            .text('HN ' + hn)
                            .text(firstName)
                            .text('')
                            .cut()
                    }

                    printer.size(2, 1)
                        .text(hosname)
                        .text('')
                        .text(servicePointName)
                        .text('')
                        .size(1, 1)
                        .text('ลำดับที่')
                        .text('')
                        .size(3, 3)
                        .text(queueNumber)
                        .text('')
                        .size(1, 1)
                        .text('authen code')
                        .size(2, 2)
                        .text(authenCode)
                        .size(1, 1)
                        .text('')
                        .text(priorityName)
                        .qrimage(qrcode, { type: 'png', mode: 'dhdw', size: 2 }, function (err) {
                            // this.text(`จำนวนที่รอ ${remainQueue} คิว`)
                            this.text('วันที่ ' + dateTime)
                            this.text('ตรวจสอบสถานะคิวผ่านแอป H4U')
                            this.text('**********************')
                            this.text('ประเมินความพึงพอใจ (กรมสุขภาพจิต)')
                            this.qrimage('http://satsurvey.dmh.go.th/app.quiz-hospital-opd.12272.html', { type: 'png', mode: 'dhdw', size: 2 }, function (err) {
                                this.text('')
                                this.cut()
                                this.close();
                            });
                        });

                });

                log(`[PRINT] Success print queue number ${queueNumber}.`, false)
            } else {
                log(`[PRINT] Queue number ${queueNumber} not found.`, false)
            }

        } else {
            log(`[PRINT] Connect printer failed (${printerIp}).`, false);
        }
    } catch (error) {
        log(`[PRINT] Error.`, false)
    }
}

async function printCID() {
    const device = new escpos.USB();
    const printer = new escpos.Printer(device);
    const myReader = new Reader()

    myReader.on('card-inserted', async (person) => {
        const cid = await person.getCid()
        const thName = await person.getNameTH()
        const dob = await person.getDoB()

        const address = await person.getAddress();
        const gender = await person.getGender();
        const issue = await person.getIssuer();
        const expireDate = await person.getExpireDate();
        const issueDate = await person.getIssueDate();
        const _address = splitAddress(address);
        const _gender = gender == 'Male' ? 'ชาย' : 'หญิง';

        console.log('=============================================');

        device.open(function () {
            printer
                .encode('tis620')
                .align('CT')
                .size(1, 1)
                .text("สำเนาบัตรประชาชน")
                .align('LT')
                .tableCustom([
                    { text: "CID", align: "LEFT", width: 0.3 },
                    { text: `: ${cid}`, align: "LEFT", width: 0.7 },
                ])
                .tableCustom([
                    { text: "Name", align: "LEFT", width: 0.3 },
                    { text: `: ${thName.prefix} ${thName.firstname} ${thName.lastname}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "Gender", align: "LEFT", width: 0.3 },
                    { text: `: ${_gender}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "Birthdate", align: "LEFT", width: 0.3 },
                    { text: `: ${dob.day}/${dob.month}/${dob.year}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "Issue Date", align: "LEFT", width: 0.3 },
                    { text: `: ${issueDate.day}/${issueDate.month}/${issueDate.year}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "Expire Date", align: "LEFT", width: 0.3 },
                    { text: `: ${expireDate.day}/${expireDate.month}/${expireDate.year}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "Address", align: "LEFT", width: 0.3 },
                    { text: `: ${_address.house_no} ${_address.mu} ${_address.tambon}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "", align: "LEFT", width: 0.3 },
                    { text: `: ${_address.ampur} ${_address.province}`, align: "LEFT", width: 0.7 }
                ])
            printer.newLine()
            printer.align('CT')
            printer.cut()
            printer.close();
        });
    })
}

async function getData() {

    var options = { method: 'GET', url: 'http://localhost:8189/api/smartcard/read-card-only' };
    return new Promise((resolve, reject) => {

        axios.request(options).then(function (response) {
            resolve(response.data);
        }).catch(function (error) {
            reject(error);
        });
    });
}


async function printCID2() {
    const device = new escpos.USB();
    const printer = new escpos.Printer(device);
    await getData().then((person) => {
        const cid = person.pid;
        const thName = {
            titleName: person.titleName,
            fname: person.fname,
            lname: person.lname
        };
        const dob = moment(person.birthDate, 'YYYYMMDD').format('DD-MM-YYYY');
        const address = '';
        const gender = person.sex == 1 ? 'ชาย' : 'หญิง';;
        // const issue = person.getIssuer();
        // const expireDate = person.getExpireDate();
        // const issueDate = person.getIssueDate();
        // const _address = splitAddress(address);
        device.open(function () {
            printer
                .encode('tis620')
                .align('CT')
                .size(1, 1)
                .text("สำเนาบัตรประชาชน")
                .align('LT')
                .tableCustom([
                    { text: "CID", align: "LEFT", width: 0.3 },
                    { text: `: ${cid}`, align: "LEFT", width: 0.7 },
                ])
                .tableCustom([
                    { text: "Name", align: "LEFT", width: 0.3 },
                    { text: `: ${thName.titleName} ${thName.fname} ${thName.lname}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "Gender", align: "LEFT", width: 0.3 },
                    { text: `: ${gender}`, align: "LEFT", width: 0.7 }
                ])
                .tableCustom([
                    { text: "Birthdate", align: "LEFT", width: 0.3 },
                    { text: `: ${dob}`, align: "LEFT", width: 0.7 }
                ])
            // .tableCustom([
            //     { text: "Issue Date", align: "LEFT", width: 0.3 },
            //     { text: `: ${issueDate.day}/${issueDate.month}/${issueDate.year}`, align: "LEFT", width: 0.7 }
            // ])
            // .tableCustom([
            //     { text: "Expire Date", align: "LEFT", width: 0.3 },
            //     { text: `: ${expireDate.day}/${expireDate.month}/${expireDate.year}`, align: "LEFT", width: 0.7 }
            // ])
            // .tableCustom([
            //     { text: "Address", align: "LEFT", width: 0.3 },
            //     { text: `: ${_address.house_no} ${_address.mu} ${_address.tambon}`, align: "LEFT", width: 0.7 }
            // ])
            // .tableCustom([
            //     { text: "", align: "LEFT", width: 0.3 },
            //     { text: `: ${_address.ampur} ${_address.province}`, align: "LEFT", width: 0.7 }
            // ])
            printer.newLine()
            printer.align('CT')
            printer.cut()
            printer.close();
        });
    })

    console.log('=============================================');



}

function splitAddress(address) {
    const arrAddress = address.trim().split('#');
    const obj = {
        house_no: arrAddress[0],
        mu: arrAddress[1],
        tambon: arrAddress[5],
        ampur: arrAddress[6],
        province: arrAddress[7],
    }
    return obj;
}