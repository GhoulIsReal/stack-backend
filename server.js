const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt-nodejs');
const cors = require('cors');
const knex = require('knex');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const db = knex({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    }
});

const app = express();

const parseToken = (req, res, next) => {
    const bearerHeader = req.headers['authorization'];
    if (bearerHeader) {
        const bearer = bearerHeader.split(' ');
        const bearerToken = bearer[1];
        req.token = bearerToken;
        next();
    } else {
        res.sendStatus(403);
    }
}

app.use(bodyParser.json());
app.use(cors()); //for unsecure requests. just to test the app on a localhost

app.get('/', (req, res) => {
    res.send("Hi from Express!")
})

app.post('/auth', (req, res) => {
    db.select('username', 'points', 'id').from('auth').where("mac_address", "=", req.body.mac_address.toLowerCase())
    .then(data => {
        if(data[0]) {
            res.json(data[0]);
        } else {
            res.status(400).json('new_user')
        }
    })
    .catch(err => res.status(400).json('unable to get user'))
})

app.post('/register', (req, res) => {
    console.log(req.body);
    if (req.body.mac_address.length == 17) {
        db.insert({
            mac_address: req.body.mac_address.toLowerCase(),
            username: req.body.username,
            points: 100
        }).into('auth').returning('username')
        .then(username => res.json(username))
        .catch(err => res.status(400).json('user already exists'));
    } else {
        res.status(400).json('wrong mac address');
    }
})

app.post('/add-question', (req, res) => {
    console.log(req.body);
    if (req.body.title && req.body.question_text) {
        db.insert({
            user_id: req.body.user_id,
            title: req.body.title,
            question_text: req.body.question_text
        }).into('questions').returning('*')
        .then(async data => {
            await db('auth').where('id', '=', req.body.user_id).decrement('points', 10);
            res.json(data)
        })
        .catch(err => res.status(400).json('unable to add question'))
    } else {
        res.status(400).json('bad request')
    }
})

app.get('/questions', (req, res) => {
    db.select('*').from('questions').join('auth', 'questions.user_id', 'auth.id').orderBy('question_primary_id', 'desc').then(data => {
        data.forEach(question => {
            const timestamp = new Date(Date.parse(question.published_date))
            question.published_date = timestamp.toLocaleString('en-us', { month: 'short', day: 'numeric' });
            delete question.mac_address;
            delete question.points;
        })
        res.json(data);
    })
    .catch(err => res.status(400).json('unable to get questions'))
})

app.get('/questions/:id/answers', (req, res) => {
    const question_id = req.params.id;
    db.select('answers.id', 'answers.question_id', 'answers.user_id', 'answers.answer_text', 'auth.username', 'answers.tips_count').from('answers').where('question_id', '=', question_id).join('auth', 'answers.user_id', 'auth.id').orderBy('answers.id', 'asc')
    .then(data => {
        res.json(data)
    })
    .catch(err => res.status(400).json(err))
})

app.post('/answer', (req, res) => {
    const { question_id, user_id, answer_text } = req.body;
    db.insert({
        question_id,
        user_id,
        answer_text
    }).into('answers').returning('*')
    .then(async answerList => {
        const username = await db.select('username').from('auth').where('id', '=', answerList[0].user_id)
        answerList[0].username = username[0].username
        console.log(answerList[0]);
        res.json(answerList[0])
    })
    .catch(err => res.status(400).json('unable to add answer'))
})

app.post('/tip', async (req, res) => {
    const { tip_source, tip_destination, answer_id } = req.body;
    if(tip_source !== tip_destination) {
        await db('auth').where('id', '=', tip_source).decrement('points', 5);
        await db('auth').where('id', '=', tip_destination).increment('points', 5);
        db('answers').where('id', '=', answer_id).increment('tips_count', 1)
        .returning('tips_count').then(tips_count => res.json(tips_count))
        .catch(err => res.status(400).json(err));
    } else {
        res.status(400).json("Bad request")
    }
})

app.listen(3001, () => {
    console.log(`app is running on port 3001`);
})
