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
        this.reqSocket.connect('tcp://127.0.0.1:3000');
        this.log.info('Connections are established\n\n');
        this.startRequestElevator();

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
        return this.waitElevatorStatus(`doors_opened_on_${this.elevatorCalledFloor}`);
    }

    async startRequestElevator() {
        this.reqSocket.on('message', data => {
            data = data.toString().split('#');
            const eventName = data.shift();
            if (eventName === 'check_status') {
                this.emit('status', ...data);
            }
        });

        while (true) {
            this.reqSocket.send('check_status');
            await utils.delay(1000) //@todo change
        }
    }

    async goInside() {
        let inside = false;
        this.waitElevatorStatus('doors_closing')
            .then(() => {
                if (inside) {
                    return
                }
                this.log.error('Doors already are closed\n');
                this.log.error('Game over. You loose\n');
                process.exit(0);
            });

        const answ = await this.question('Elevator is here. Go inside? Yes/No\n-> ');
        if (answ.toLowerCase() === 'yes') {
            inside = true;
            return this.log.info('We are inside\n');
        }

        this.log.error('Game over. You loose\n');
        process.exit(0); //@todo need more code
    }

    async chooseTheFloor() {
        const floor = await this.question('Choose the floor to go\n-> ');
        this.reqSocket.send(`choose_floor#${floor}`);

        return this.waitElevatorStatus(`doors_opened_on_${floor}`);
    }

    async goOutside() {
        const answ = await this.question('Go outside? Yes/No\n-> ');
        if (answ.toLowerCase() === 'yes') {
            return this.log.info('Congratulations! You are finished your trip!')
        }

        this.log.info('Game over. You loose \n');
        process.exit(0); //@todo need more code
    }

    async waitElevatorStatus(name) {
        return new Promise(resolve => {
            this.on('status', status => {
                status === name && resolve()
            })
        })
    }
}

const client = new Client();
client.start()
    .catch(console.error);