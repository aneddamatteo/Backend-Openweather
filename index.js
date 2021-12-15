const express = require('express');
const cors = require('cors');
const rp = require ('request-promise');
const crypto_js = require('crypto');
const jwt = require('jsonwebtoken');
const passport_jwt = require('passport-jwt');
const passport = require('passport');
const app = express();
const port = 8000;
const minute_const = 60000;
const refresh = 15;
const appid = 'c8c7483638c50bd4873d63678a5235ce';
const mongoose = require("mongoose");
const JwtStrategy = passport_jwt.Strategy;
const cookieParser = require("cookie-parser");


require("dotenv").config();
const MONGODB_URL= "mongodb://127.0.0.1/";
const secret_key = "9C7B7B2E9DEB5655966B4789F2ADD";

mongoose.connect(
    MONGODB_URL,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
);

const location_weather_schema = new mongoose.Schema({
    _id: String ,
    temp: Array,
    humidity:Array,
    wind:Array,
    pressure: Array,
    timestamp_refresh: Array
});
const user_schema = new mongoose.Schema({
    _id: Number,
    username: String,
    password: String,
    //token: String
});

const counters_schema = new mongoose.Schema({
    _id: String,
    seq: Number
});

const Location_weather = mongoose.model('Location_weather', location_weather_schema);
const User = mongoose.model('User', user_schema);
const Counter = mongoose.model('Counter', counters_schema);

Counter.find({}).exec().then(data => {
    if (data.length == 0) {
        let new_counter = new Counter({_id: "userid", seq: 0});
        new_counter.save().then(() => console.log("Counter inserito nel databse"));
    }else{
        console.log("Counter già inserito");
    }
});
const corsConfig = {
    credentials: true,
    origin: true,
};
app.use(cors(corsConfig));
app.use(passport.initialize());
//app.use(passport.session());
app.use(cookieParser());
app.listen(port, () => {console.log('Listening on port' + port)});
app.use(express.json())// for parsing application/json
//app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

let cookieExtractor = function(req) {
    let token = null;
    if (req && req.cookies)
    {
        token = req.cookies['jwt'];
    }
    else
        console.log("Nessun cookie presente");
    return token;
};

// Passport
let opts = {}
opts.jwtFromRequest = cookieExtractor;
opts.secretOrKey = secret_key;
passport.use(new JwtStrategy(opts, function(jwt_payload, done) {
    User.findOne({ id: jwt_payload.sub }, function(err, user) {
        if (err) {
            return done(err, false);
        }
        if (user) {
            return done(null, user);
        } else {
            return done(null, false);
        }
    });
}));


app.post('/login',async (req,res) => {
    try{
        let user = processUserData(req.body);
        let query = await User.findOne({"username":user.username}).exec();
        if(query != null){
            let psw =  crypto_js.createHash('sha256').update(user.password).digest('hex');
            if (psw == query.password) {
                let token = jwt.sign({id:query._id,username:query.username,password:query.password}, secret_key,{expiresIn: 6000});
                //const options = {maxAge: 600000};
                res.cookie('jwt',token);
                res.json({message:"ok", success: true, token: token});
            }
            else
                res.send({message:"Password errata", success:false});
        }
        else
            res.send({message:"Username inserito non esiste", success:false});
    }catch (e) {
        console.error(e);
    }

});

app.put('/updateUser', passport.authenticate('jwt', {session:false}), async (req, res) => {
    try{
        let user_mod = processUserData(req.body);
        let message_psw = "Password non modificata", message_user ="Username non modificato";
        let old_user = req.user;
        let psw = crypto_js.createHash('sha256').update(user_mod.password).digest('hex');

        if (old_user.username != user_mod.username) {
            let query = await User.find({username: user_mod.username}).exec();
            if(query.length == 0){
                await User.updateOne({_id: old_user._id},{username:user_mod.username}).exec();
                message_user = "Username modificato";
            }
            else{
                message_user = "Username già in uso da un altro utente";
            }
        }
        if (old_user.password != psw){
            await User.updateOne({_id: old_user._id},{password:psw}).exec();
            message_psw = "Password modificata";
        }
        res.send({message_user:message_user,message_psw:message_psw});
    }catch (e) {
        console.error(e);
    }

});

app.delete('/deleteUser',passport.authenticate('jwt',{session: false}), (req,res) => {
    try{
        let user = req.user;
        User.deleteOne({_id:user._id}).exec();
        res.cookie('jwt', {expires: Date.now()});
        res.send({message:"Username eliminato"});
    }catch (e) {
        console.error(e);
    }

});



app.post('/registrazione',async (req,res) => {
    try{
        let new_user = processUserData(req.body);
        let result = await User.findOne({username:new_user.username}).exec();
        if (!result) {
            createNewUser(new_user);
            res.send({message: "Username registrato correttamente"});
        }
        else {
            res.send({message: "Username già in uso"});
        }
    }catch (e) {
        console.error(e);
    }

});

app.get('/', passport.authenticate('jwt',{session:false}), (req,res) => res.send('My first REST API!'));

app.get('/weather/:location', passport.authenticate('jwt', {session:false}), (req,res) => {
    try{
        let location = req.params.location;
        rp('https://api.openweathermap.org/data/2.5/weather?q=' + location + '&appid=' + appid,
            {json:true}).then(body => {
            let result = processData(body);
            let result_find = Location_weather.find({_id:result.location}).exec();
            result_find.then(data => {
                if (data.length >= 1) {
                    let difference = (Date.now() - data[0].timestamp_refresh[data[0].timestamp_refresh.length-1])/minute_const;
                    if (difference > refresh){
                        Location_weather.updateOne({_id: result.location}, updateModelMongo(result,data[0])).exec();
                        res.send(result);
                    }
                    else {
                        res.send(processDataFromMongo(data[0]));
                    }
                }else{
                    let location_mongo = createModelMongo(result);
                    location_mongo.save().then(() => console.log("One entry added"));
                    res.send(result);
                }
            });
        }).catch(err => {
            res.send(err);
        });
    }catch (e) {
        console.error(e);
    }

});

app.get('/storedLocation', passport.authenticate('jwt',{session: false}), async (req,res) => {
    try{
        let result = await Location_weather.find({}).exec();
        if (result.length == 0)
            res.send("Database vuoto");
        else
            res.send(processAllDataFromMongo(result));
    }catch (e) {
        console.error(e);
    }

});

app.get('/dbLocation/:location', passport.authenticate('jwt',{session: false}), async (req,res) => {
    try{
        let location = req.params.location;
        let result = await Location_weather.find({_id:location}).exec();
        if (result.length == 0)
            res.send({});
        else
            res.send(result);
    }catch (e) {
        console.error(e);
    }

});


app.post('/insertLocation', passport.authenticate('jwt',{session: false}), async (req,res) => {
    try{
        let body = processManualData(req.body);
        let manual_insert = await Location_weather.findOne({_id:body.location}).exec();
        if (manual_insert != null) {
            let difference = (Date.now() - manual_insert.timestamp_refresh[manual_insert.timestamp_refresh.length-1])/minute_const;
            if (difference > refresh){
                await Location_weather.updateOne({_id: body.location}, updateModelMongo(body,manual_insert)).exec();
                res.send({message:"La località è presente nel Database ed è stata aggiornata"});
            }
            else {
                res.send({message : "La località è presente nel Database e non può essere ancora aggiornata"});
            }
        }else{
            let location_mongo = createModelMongo(body);
            location_mongo.save().then(() => console.log("One entry added"));
            res.send({message : "La nuova località è stata aggiunta nel database"});
        }
    }catch (e) {
        console.error(e);
    }

});

app.put('/updateLocation', passport.authenticate('jwt',{session: false}), async (req,res) =>{
    try{
        let body = processManualData(req.body);
        let update = await Location_weather.findOne({_id:body.location}).exec();
        if (update != null) {
            await Location_weather.updateOne({_id: body.location}, updateModelMongo(body,update)).exec();
            res.send({message:"La località è presente nel Database ed è stata aggiornata"});
        }else{
            res.send({message:"La nuova località non presente nel database"});
        }
    }
    catch (e){
        console.error(e);
    }

});

app.delete('/deleteLocation', passport.authenticate('jwt',{session: false}), async (req, res) => {
    try {
        let body = processManualData(req.body);
        let delete_location = await Location_weather.findOne({_id: body.location}).exec();
        if (delete_location != null) {
            await Location_weather.deleteOne({_id: body.location}).exec();
            res.send({message: "Località eliminata dal database"});
        } else {
            res.send({message: "Località non presente nel database"});
        }
    }
    catch (e) {
        console.error(e)
    }
});

function processManualData(body){
    return {
        "location": body.location,
        "temp": body.temp,
        "humidity": body.humidity,
        "wind": body.wind,
        "pressure": body.pressure
    };
}

function processData(body){
    return {
        "location": body.name,
        "temp": parseFloat((body.main.temp - 273.15).toFixed(1)),
        "humidity": body.main.humidity,
        "wind": body.wind.speed,
        "pressure": body.main.pressure,
    };

}
function processAllDataFromMongo(data){
    let show_data = []
    for (let x in data) {
        show_data.push(processDataFromMongo(data[x]));
    }
    return show_data;
}

function processDataFromMongo(data){
    return {
        "location": data._id,
        "temp": data.temp[data.temp.length-1],
        "humidity": data.humidity[data.humidity.length-1],
        "wind": data.wind[data.wind.length-1],
        "pressure": data.pressure[data.pressure.length-1]
    };
}
function createModelMongo(result){
    return  new Location_weather({
        _id: result.location ,
        temp: [result.temp],
        humidity: [result.humidity],
        wind:[result.wind],
        pressure: [result.pressure],
        timestamp_refresh: [Date.now()]
    });
}

function updateModelMongo(result,data){
    if (result.temp.length > 0)
        data.temp.push(result.temp);
    if (result.humidity.length > 0)
        data.humidity.push(result.humidity);
    if (result.wind.length > 0)
        data.wind.push(result.wind);
    if (result.pressure.length > 0)
        data.pressure.push(result.pressure);
    data.timestamp_refresh.push(Date.now());

    return new Location_weather({
        _id: result.location ,
        temp: data.temp,
        humidity: data.humidity,
        wind: data.wind,
        pressure: data.pressure,
        timestamp_refresh: data.timestamp_refresh
    });
}

function createNewUser(user){
    let psw = crypto_js.createHash('sha256').update(user.password).digest('hex');
    let result = Counter.findOneAndUpdate({_id:"userid"}, { $inc: { seq: 1 } }).exec();
    result.then(data => {
        /*let jwt_user = {
            id: data.seq,
            username: user.username,
            password: psw
        }*/
        let user_mongo = new User({
            _id : data.seq,
            username : user.username,
            password : psw,
            //token: jwt.sign(jwt_user,privateKey),
        });
        user_mongo.save().then(() => console.log("user inserito"));
    });
}
function processUserData(body){
    return {
        "username": body.username,
        "password": body.password
    };
}