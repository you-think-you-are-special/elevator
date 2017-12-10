const zmq = require('zmq');
const readline = require('readline');
const utils = require('./utils');
const EventEmiter = require('events');
const Ajv = require('ajv');


//@todo max flow karp alg
class Elevator extends EventEmiter {
    constructor(validateSettings) {
        super();
        this.validateSettings = validateSettings;
        this.log = console;
        this.repSocket = zmq.createSocket('rep');
        this.settings = {
            lastFloor: 10,
            heightFloor: 10,
            speed: 10,
            msForOpenDoors: 1000,
            msForCloseDoors: 1000,
            msForWaitingClient: 20000,
            currentFloor: 0,
            delayBetweenFloors: 1000
        };
        this.queue = [];
        this.areDoorsOpened = false;
    }

    async start() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'ELEVATOR>'
        });
        this.question = utils.createQuestion(this.rl);
        this.rl.prompt();

        this.log.info('\n\nStarting elevator');
        await this.establishConnections();
        this.log.info('Connections are established');
        await this.askForSettings();
        this.startReplyClients();
        this.processQueueOfClients()
            .catch(this.log.error)
    }

    async processQueueOfClients() {
        while (true) {
            if (!this.queue.length) {
                await this.waitQueue();
            }
            const job = this.queue.pop();
            await this.goToTheFloor(job.floor);
            await this.openDoors();

            if (job.replyType === 'called_on_floor') {
                this.repSocket.send('elevator_is_here');
            }

            if (job.replyType === 'called_in_elevator') {
                this.repSocket.send('finish_trip');
            }

            await this.waitForClient();
            await this.closeDoors();
        }
    }

    async askForSettings() {
        const settings = this.settings;
        this.log.info('\nHello! Please, input params of elevator:\n');

        settings.lastFloor = await this.question('Last floor? 4 - 20\n-> ');
        settings.heightFloor = await this.question('Height of the floor? In metres 2 - 10\n-> ');
        settings.speed = await this.question('Speed of the elevator? Metres per second 1 - 6\n-> ');
        settings.delayBetweenFloors = settings.heightFloor * 1000 / settings.speed;

        for (const key in settings) {
            settings[key] = parseInt(settings[key], 10);
        }

        if (!this.validateSettings(settings)) {
            this.log.error('Bad guy!\n', this.validateSettings.errors);
            process.exit(0);
        }

        this.log.info('OK! Elevator ready for work\n');
    }

    startReplyClients() {
        const actions = {
            sync_settings: async () => {
                this.log.info('Send settings to new client');
                this.repSocket.send(`sync_settings#${JSON.stringify(this.settings)}`);
            },

            call_elevator: async floor => {
                this.log.info(`Elevator called on ${floor} floor`);
                this.queue.push({
                    replyType: 'called_on_floor',
                    floor: floor
                });
                this.emit('call_elevator');
            },

            choose_floor: async floor => {
                this.queue.unshift({
                    replyType: 'called_in_elevator',
                    floor: floor
                });
            },

            are_doors_opened: async () => {
                this.repSocket.send(`are_doors_opened#${this.areDoorsOpened}`);
            },

            defaults: async action => {
                this.repSocket.send(action);
            }
        };

        this.repSocket.on('message', data => {
            data = data.toString().split('#');
            const action = data.shift();
            if (actions[action]) {
                return actions[action](...data)
                    .catch(this.log.error)
            }

            actions.defaults(action)
        });
    }

    async goToTheFloor(floor) {
        const settings = this.settings;
        const isUp = settings.currentFloor < floor;
        let i;
        if (isUp) {
            for (i = settings.currentFloor + 1; i <= floor; i++) {
                await utils.delay(settings.delayBetweenFloors);
                settings.currentFloor = i;
                this.log.info(`Current floor is ${i}`);

                // const anotherClientsDirections = this.list[client.floor];
                // if (!anotherClientsDirections && !anotherClientsDirections.includes(client.direction)) {
                //     continue;
                // }
                //
                // await this.openDoors();
                // await Promise.all([
                //     this.notifyClients(), //chooseFloor for each client
                //     this.closeDoors()
                // ]);
            }
            return
        }

        //if down
        for (i = settings.currentFloor + 1; i >= floor; i--) {
            await utils.delay(settings.delayBetweenFloors);
            settings.currentFloor = i;
            this.log.info(`Current floor is ${i}`);
        }
    }

    async waitForClient() {
        this.log.info('Wait for client');
        await utils.delay(this.settings.msForWaitingClient);
        this.log.info('Stop wait for client');
    }

    async closeDoors() {
        this.log.info('Closing the doors');
        this.areDoorsOpened = false;
        await utils.delay(this.settings.msForCloseDoors);
        this.log.info('Doors are closed');
    }

    async openDoors() {
        this.log.info('Opening the doors');
        await utils.delay(this.settings.msForOpenDoors);
        this.areDoorsOpened = true;
        this.log.info('Doors are opened');
    }

    async establishConnections() {
        return utils.promiseCall(
            this.repSocket, this.repSocket.bind, 'tcp://127.0.0.1:3000'
        );
    }

    async waitQueue() {
        return new Promise(resolve => {
            this.on('call_elevator', resolve)
        });
    }
}

const settingsSchema = {
    "properties": {
        "lastFloor": {
            "type": "integer",
            "maximum": 20,
            "minimum": 4,
            "default": "20"
        },
        "heightFloor": {
            "type": "integer",
            "maximum": 10,
            "minimum": 2,
            "default": 3
        },
        "speed": {
            "type": "integer",
            "maximum": 6,
            "minimum": 1,
            "default": 1
        }
    },
    "required": ["lastFloor", "heightFloor", "speed"]
};

const ajv = new Ajv({allErrors: true, useDefaults: true});
ajv.addFormat('integer', val => {
    try {
        parseInt(val, 10);
        return true
    } catch (e) {
        return false
    }
});
const validateSettings = ajv.compile(settingsSchema);
const elevator = new Elevator(validateSettings);
elevator.start()
    .catch(console.error);