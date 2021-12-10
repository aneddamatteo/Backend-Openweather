const express = require('express');
const cors = require('cors');
const rp = require ('request-promise');
const app = express();
const port = 8000;
const minute_const = 60000;
const refresh = 15;
const appid = 'c8c7483638c50bd4873d63678a5235ce';
const mongoose = require("mongoose");
require("dotenv").config();
const MONGODB_URL= "mongodb://127.0.0.1/";

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

const Location_weather = mongoose.model('Location_weather', location_weather_schema);

app.use(cors());
app.listen(port, () => {console.log('Listening on port' + port)});
app.get('/', (req,res) => res.send('My first REST API!'));
app.get('/weather/:location', (req,res) => {
    let location = req.params.location;
    rp('https://api.openweathermap.org/data/2.5/weather?q=' + location + '&appid=' + appid,
        {json:true}).then(body => {
            let result = processData(body);
            let result_find = Location_weather.find({_id:result.location}).exec();
            result_find.then(data => {
                if (data.length >= 1) {
                    let difference = (Date.now() - data[0].timestamp_refresh[data[0].timestamp_refresh.length-1])/minute_const;
                    console.log(difference);
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
});

app.get('/storedLocation', (req,res) => {
    let result = Location_weather.find({}).exec();
    result.then(data => {
        if (data.length < 1)
            res.send("Database vuoto");
        else
            res.send(processAllDataFromMongo(data));
    });
});

app.get('/dbLocation/:location', (req,res) => {
    let location = req.params.location;
    let result = Location_weather.find({_id:location}).exec();
    result.then(data => {
        if (data.length < 1)
            res.send({});
        else
            res.send(data);
    });
});

app.use(express.json())// for parsing application/json
//app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

app.post('/insertLocation', (req,res) => {
    let body = processManualData(req.body);
    let manual_insert = Location_weather.find({_id:body.location}).exec();
    manual_insert.then(data => {
        if (data.length >= 1) {
            let difference = (Date.now() - data[0].timestamp_refresh[data[0].timestamp_refresh.length-1])/minute_const;
            if (difference > refresh){
                Location_weather.updateOne({_id: body.location}, updateModelMongo(body,data[0])).exec();
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
    });
});

app.put('/updateLocation', (req,res) =>{
    let body = processManualData(req.body);
    let update = Location_weather.find({_id:body.location}).exec();
    update.then(data => {
        if (data.length == 1) {
            Location_weather.updateOne({_id: body.location}, updateModelMongo(body,data[0])).exec();
            res.send({message:"La località è presente nel Database ed è stata aggiornata"});
        }else{
            res.send({message:"La nuova località non presente nel database"});
        }
    });
});

app.delete('/deleteLocation', (req, res) => {
    let body = processManualData(req.body);
    let delete_location = Location_weather.find({_id:body.location}).exec();
    delete_location.then(data => {
        if (data.length == 1){
            Location_weather.deleteOne({_id: body.location}).exec();
            res.send({message:"Località eliminata dal database"});
        }
        else{
            res.send({message:"Località non presente nel database"});
        }
    });
})

function processManualData(body){
    let result = {
        "location": body.location,
        "temp": body.temp,
        "humidity": body.humidity,
        "wind": body.wind,
        "pressure": body.pressure
    }
    return result;
}

function processData(body){
    let result = {
        "location": body.name,
        "temp": parseFloat((body.main.temp - 273.15).toFixed(1)),
        "humidity": body.main.humidity,
        "wind": body.wind.speed,
        "pressure": body.main.pressure,
    }
    return result;
}
function processAllDataFromMongo(data){
    let show_data = []
    for (let x in data) {
        show_data.push(processDataFromMongo(data[x]));
    }
    return show_data;
}

function processDataFromMongo(data){
    let result = {
        "location": data._id,
        "temp": data.temp[data.temp.length-1],
        "humidity": data.humidity[data.humidity.length-1],
        "wind": data.wind[data.wind.length-1],
        "pressure": data.pressure[data.pressure.length-1]
    }
    return result;
}
function createModelMongo(result){
    let model = new Location_weather({
        _id: result.location ,
        temp: [result.temp],
        humidity: [result.humidity],
        wind:[result.wind],
        pressure: [result.pressure],
        timestamp_refresh: [Date.now()]
    })
    return model
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

    let model = new Location_weather({
        _id: result.location ,
        temp: data.temp,
        humidity: data.humidity,
        wind: data.wind,
        pressure: data.pressure,
        timestamp_refresh: data.timestamp_refresh
    })
    return model
}