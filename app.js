/*  ----------------------------
		    Server Stuff 
	-----------------------------
*/
var express = require('express')
var path = require('path');
var request = require('request');
var queryString = require('query-string');
var session = require('express-session')
var _ = require('lodash');
var app = express();
var client_id = 'client id'; // client id
var client_secret = 'secret id'; // secret id
var redirect_uri = 'http://noahstapp/erato/callback'; // redirect uri

// Session functionality
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
}));

app.use(express.static(__dirname + '/public'));


// Default page path
app.get('/erato/', function (req, res) {
    res.sendFile(path.join(__dirname + '/public/index.html'));
});

// Search endpoint
app.get('/erato/search', function(req, res) {
    // Dynamic object for data
    const info = new Object();
    // artist value from search
    info.queryName = req.query.search;
    // obscurity value from search
    info.queryObscurity = req.query.obscurity;
    // Get original artist info
    getOriginalArtistInfo(info)
    // Get similar artists info
    .then(getSimilarArtistsInfo)
    // Send everything back to client
    .then(function(info){
			res.send(info);
	});
});

// Login endpoint
app.get('/erato/login', function(req, res) {
    // Request authorization from user, prompt user to login
    var scope = 'playlist-modify-public';
    res.redirect('https://accounts.spotify.com/authorize?' +
        queryString.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
    }));
});

// Spotify auth redirect endpoint
app.get('/erato/callback', function (req, res) {
    // Request refresh and access tokens from api
    var code = req.query.code;
    // Authorization options for API call
    var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
    },
    headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
    },
    json: true
    };
    // POST request for tokens
    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            // Save access tokens to global variables
            // TODO replace with secure tokens
            req.session.accessToken = body.access_token;
            req.session.refreshToken = body.refresh_token;
            // Redirect to logged-in endpoint
            res.redirect('/loggedin');
        };
    });
});

// Logged-in endpoint
app.get('/erato/loggedin', function (req, res) {
    // Logged-in page, replaces login button with generate playlist button
    res.sendFile(path.join(__dirname + '/public/callback.html'));
})

// Playlist generation endpoint
app.get('/erato/playlist', function (req, res) {
    // Dynamic object for data
    const info = new Object();
    // 5 random similar artists from client, used as seeds for reccomendations
    info.seedArtists = req.query.seedArtists;
    // Original artist searched by user
    info.searchedArtist = req.query.searchedArtist
    // Access codes from user session
    info.accessToken = req.session.accessToken;
    info.refreshToken = req.session.refreshToken;
    // Get logged-in user's ID
    getUserId(info)
    // Create an empty playlist for user
    .then(createPlaylist)
    // Get reccomendations based on seed artists
    .then(getPlaylistItems)
    // Add reccomendations to playlist
    .then(addPlaylistItems)
    // Signal client that the playlist is generated
    .then(function(info){
        res.send(info.playlistName);
    })
});

/* Search Functionality */

// API call credentials variable
var clientCredentialsOptions = {
  url: 'https://accounts.spotify.com/api/token',
  headers: {
    'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
  },
  form: {
    grant_type: 'client_credentials'
  },
  json: true
};

// Get the searched artist's info
function getOriginalArtistInfo(info) {
    return new Promise(function(resolve, reject) {
        // Artist name from client
        var artistName = info.queryName
        // API call here, get unique artistID
        request.post(clientCredentialsOptions, function(error, response, body) {
            // use access token to access API
            var token = body.access_token;
            var options = {
                url: 'https://api.spotify.com/v1/search?q=' + artistName + '&type=artist',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
            };
            request.get(options, function(error, response, data) {
                if(error) throw error;
                data = JSON.parse(data);
                // Get artistID of the correct artist
                const artists = _.get(data, 'artists.items');
                if(error) reject(error);
                // Original Artist is the first artist in list, should always be the correct one
                var firstArtist = _.first(artists);
                // Create object of the desired artist properties
                var originalArtist = _.pick(firstArtist, ['name', 'id', 'popularity', 'genres']);
                //originalArtist.image = _.find(firstArtist.images, image => image.width < 1000);
                // Add original artist properties to info map with key 'originalArtist'
                info.originalArtist = originalArtist;
                resolve(info);
            });
        });
    });
}

// Get info of similar artists to the original artist
function getSimilarArtistsInfo(info) {
    return new Promise(function(resolve, reject) {
        // ID of the original artist
        artistId = info.originalArtist.id;
        // Desired value of obscurity 
        obscurityValue = info.queryObscurity;
        // API call here, get similar artists based on user parameters
        request.post(clientCredentialsOptions, function(error, response, body) {
            // use access token to access API
            var token = body.access_token;
            var options = {
                url: 'https://api.spotify.com/v1/artists/' + artistId + '/related-artists',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
            };
            request.get(options, function (error, response, data) {
                if(error) throw error;
                data = JSON.parse(data);
                // Get an object of artist objects
                const artists = _.get(data, 'artists');
                // Filter artists based on obscurity values
                const filteredArtists = _.filter(artists, function(item) {
                    if(obscurityValue == 1) {
                        return item.popularity <= 50;
                    }
                    else if(obscurityValue == 2) {
                        return item.popularity <= 65 && item.popularity > 50;
                    }
                    else if(obscurityValue == 3) {
                        return item.popularity <= 100 && item.popularity > 65;
                    }
                    else {
                        return item.popularity;
                    }
                });
                // Create an array of filtered artists with the desired parameters
                var similarArtists = _.map(filteredArtists, function(artist) {
                    var obj = _.pick(artist, ['name', 'id', 'popularity', 'genres']);
                    // obj.image = _.find(artist.images, function(image) {
                    //     return image.width < 1000;
                    // });
                    // Get first 12 genres only
                    obj.genres.length = 12;
                    obj.genres = _.compact(obj.genres);
                    return obj;
                });
                // Add similar artists properties to info map with key 'similarArtists'
                info.similarArtists = similarArtists;
                resolve(info);
            });
        });
    });
}

/* Playlist Functionality */

// Get the current user's Spotify ID 
function getUserId(info) {
    return new Promise(function(resolve, reject) {
        // Access token for API call
        var accessToken = info.accessToken
        // API Endpoint for user profile API call
        var options = {
            url: 'https://api.spotify.com/v1/me',
            headers: { 'Authorization': 'Bearer ' + accessToken }
        };
        // API call for user ID
        request.get(options, function(error, response, data) {
            if(error) throw error;
            data = JSON.parse(data);
            // Get user ID
            var userId = _.get(data, "id");
            // Add user ID to info map with key 'userId'
            info.userId = userId
            resolve(info);
        });
    });
}

// Create new empty playlist for user
function createPlaylist(info) {
    return new Promise(function(resolve, reject) {
        // Access token for API call
        var accessToken = info.accessToken
        // Current user's spotify ID
        const userId = info.userId;
        const searchedArtist = info.searchedArtist
        // Playlist name includes original artist searched by user
        const name = ('Playlist based on ' + searchedArtist);
        const dataString = JSON.stringify({
                'name': name
        });
        // API Endpoint for playlist creation API call
        var options = {
            url: 'https://api.spotify.com/v1/users/'+userId+'/playlists',
            headers: {'Authorization': 'Bearer ' + accessToken,    
                      'Content-Type': 'application/json'},
            body: dataString
        };
        // API call to create playlist
        request.post(options, function(error, response, data) {
            if(error) throw error;
            data = JSON.parse(data);
            // Get unique playlist ID
            const playlistId = _.get(data, "id");
            // Add playlist ID to info map with key 'playlistId' 
            info.playlistId = playlistId;
            // Add playlist name to info map with key 'playlistName' 
            info.playlistName = name;
            resolve(info);
        });
    });
}

// Get tracks for playlist based on reccomendations
function getPlaylistItems(info) {
    return new Promise(function(resolve, reject) {
        // Access token for API call
        var accessToken = info.accessToken
        var seedArtists = info.seedArtists;
        // API Endpoint for track reccomendations based on seed artists, 45 tracks that are available in US
        var options = {
            url: 'https://api.spotify.com/v1/recommendations?'+'seed_artists='+seedArtists+'&market=US&limit=45',
            headers: { 'Authorization': 'Bearer ' + accessToken },
        };
        // API Request for track IDs
        request.get(options, function(error, response, data) {
            if(error) throw error;
            data = JSON.parse(data);
            // Filter down to track objects
            const tracks = _.get(data, 'tracks');
            // Filter down to only track IDs
            var filteredTracks = _.map(tracks, function(item){
                var obj = _.pick(item, ['uri']);
                return obj;
            });
            // Put all ID's under one key
            info.trackIds = _.map(filteredTracks, 'uri');
            // Add track IDs to info map with key 'trackIds'
            resolve(info);  
        });
    });
}

// Add reccomended tracks to created playlist
function addPlaylistItems(info) {
    return new Promise(function(resolve, reject) {
        // Access token for API call
        var accessToken = info.accessToken
        // Current user's ID
        var userId = info.userId;
        // Unique ID of created playlist
        var playlistId = info.playlistId;
        // JSON array of reccomended track IDs
        var trackIds = info.trackIds;
        // JSON string of playlist name
        var playlistName = info.playlistName
        // API endpoint for playlist track addition 
        var options = {
            url: 'https://api.spotify.com/v1/users/'+userId+'/playlists/'+playlistId+'/tracks',
            headers: {'Authorization': 'Bearer ' + accessToken,
                      'Content-Type': 'application/json'},
            body: JSON.stringify({
                "uris": trackIds
		    }),
        };
        // API call to add tracks to playlist
        request.post(options, function(error, response, data) {
            if(error) throw error;
            // TEMPORARY console log for success
            console.log('Success!' + '' + playlistName + '' + ' Created' );
            resolve(info);
        })
    });
}

// Run application on port 8000
app.listen(8000, function () {
    console.log('Erato running on port 8000!')
})