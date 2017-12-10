const readline = require('readline');
const zmq = require('zmq');
const EventEmiter = require('events');
const utils = require('./utils');

//@todo validate input params by settings
class Client extends EventEmiter {
    constructor() {
        super();
        this.log = console;
        this.reqSocket = zmq.socket('req');
    }

    async start() {
        this.log.info('Starting new client');
        await this.establishConnections();
        this.log.info('Connections are established\n\n');
        await this.startRequestElevator();

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'ELEVATOR>'
        });

        this.question = utils.createQuestion(this.rl);

        this.rl.prompt();

        while (true) {
            await this.callElevator(); //doors are opened
            await this.goInside();
            await this.chooseTheFloor();
            await this.goOutside();
        }
    }

    async callElevator() {
        this.elevatorCalledFloor = await this.question('Choose the floor where you are\n-> '); //@todo validate
        this.reqSocket.send(`call_elevator#${this.elevatorCalledFloor}`);

        return new Promise(resolve => {
            this.on('elevator_is_here', resolve)
        });
    }

    async establishConnections() {
        this.reqSocket.connect('tcp://127.0.0.1:3000');
    }

    async startRequestElevator() { //prepareElevatorMsgs mb
        const actions = {
            sync_settings: (settings) => {
                this.settings = JSON.parse(settings);
            },

            defaults: (action, data) => {
                this.emit(action, data)
            }
        };

        return new Promise(resolve => {
            this.reqSocket.on('message', data => {
                data = data.toString().split('#');
                const action = data.shift();
                if (actions[action]) {
                    actions[action](...data);
                    return resolve();
                }

                actions.defaults(action, data);
                resolve()
            });
            this.reqSocket.send('sync_settings');
        });
    }

    async goInside() {
        const answ = await this.question('Elevator is here. Go inside? Yes/No\n-> ');
        if (answ.toLowerCase() === 'yes') {
            const areDoorsOpened = await this.areDoorsOpened();
            if (areDoorsOpened) {
                return this.log.info('We are inside\n');
            }
            this.log.error('Doors already are closed\n');
        }

        this.log.error('Game over. You loose\n');
        process.exit(0); //@todo need more code
    }

    async areDoorsOpened() {
        this.reqSocket.send('are_doors_opened');

        return new Promise(resolve => {
            this.on('are_doors_opened', ([are_doors_opened]) => resolve(are_doors_opened === 'true'))
        })
    }

    async chooseTheFloor() {
        const floor = await this.question('Choose the floor to go\n-> ');
        this.reqSocket.send(`choose_floor#${floor}`);

        return new Promise(resolve => {
            this.on('finish_trip', resolve)
        });
    }

    async goOutside() {
        const answ = await this.question('Go outside? Yes/No\n-> ');
        if (answ.toLowerCase() === 'yes') {
            return this.log.info('Congratulations! You are finished your trip!')
        }

        this.log.info('Game over. You loose \n');
        process.exit(0); //@todo need more code
    }
}

const client = new Client();
client.start()
    .catch(console.error);