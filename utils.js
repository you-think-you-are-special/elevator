module.exports.delay = (ms) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve()
        }, ms)
    });
};

module.exports.createQuestion = (readline) => {
    return str => {
        return new Promise(resolve => {
            return readline.question(str, cmd => {
                resolve(cmd)
            })
        })
    }
};

module.exports.promiseCall = (context, fn, ...params) => {
    return new Promise((resolve, reject) => {
        fn.call(context, ...params, err => {
            if (err) {
                return reject(err)
            }
            resolve()
        });
    });
};

module.exports.inQueue = (queue, floor) => {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].floor == floor) {
            return true
        }
    }
    return false
};

module.exports.removeFromQueue = (queue, floor) => {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].floor == floor) {
            queue.splice(i, 1)
        }
    }
};