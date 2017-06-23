// Obscurity range slider values
var obscurityValues =
{
    "1": "Obscure",
    "2": "Somewhat known",
    "3": "Well-known",
    "4": "Any popularity"
};

// Hide loader on page load
$(document).ready(function() {
  $('.sk-wave').hide();
  // If redirected to logged-in page, automatically search user input again
  var pathName = window.location.pathname;
  if (pathName == "/erato/loggedin") {
      var searchValue = docCookies.getItem("artistSearch");
      var obscurityValue = docCookies.getItem("obscuritySearch");
      $('#search').val(searchValue);
      $('#obscurity').val(obscurityValue);
      var query = { 
          search: $('#search').val(),
          obscurity: $('#obscurity').val(),
      };
      $('.sk-wave').show();
      $.ajax({
          url: 'erato/search',
          data: query,
          success: function(info) {
              $('.sk-wave').hide();
              // Prepare result templates
              let originalArtistTemplate = _.template($('#original-artist').html());
              let similarArtistTemplate = _.template($('#similar-artist').html());
              //console.log(info.similarArtists);
              // Clear any previous results
              $('.results').empty();
              // Display the original artist result
              $('.results').append(originalArtistTemplate(info.originalArtist));
              _.each(info.similarArtists, function(artist) {
                  // Classify genres shared between similar artists and the original artist
                  artist.sharedGenres = _.reduce(artist.genres, function(result, genre) {
                      result[genre] = _.includes(info.originalArtist.genres, genre);
                      return result;
                  }, {});
                  // Display the similar artists results
                  $('.results').append(similarArtistTemplate(artist));  
              });
          },
      });
    }
});

$(function(){
  // Dynamic labels for obscurity slider
 $('#obscurityText').text(obscurityValues[$('#obscurity').val()]);
 $('#obscurity').on('input change', function () {
    $('#obscurityText').text(obscurityValues[$(this).val()]);
 });
 // Search using inputted artist and obscurity value
$('#search').on('keydown', function(e){
     if(e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        var query = { 
            search: $('#search').val(),
            obscurity: $('#obscurity').val(),
         };
        $('.sk-wave').show();
        $.ajax({
        url: '/erato/search',
        data: query,
        success: function(info) {
            $('.sk-wave').hide();
            // Prepare result templates
            let originalArtistTemplate = _.template($('#original-artist').html());
            let similarArtistTemplate = _.template($('#similar-artist').html());
            //console.log(info.similarArtists);
            // Clear any previous results
            $('.results').empty();
            // Display the original artist result
            $('.results').append(originalArtistTemplate(info.originalArtist));
            _.each(info.similarArtists, function(artist) {
                // Classify genres shared between similar artists and the original artist
                artist.sharedGenres = _.reduce(artist.genres, function(result, genre) {
                    result[genre] = _.includes(info.originalArtist.genres, genre);
                    return result;
                }, {});
                // Display the similar artists results
                $('.results').append(similarArtistTemplate(artist));  
            });
            // Get 5 random similar artists
            var playlistArtistsId = _.map(info.similarArtists, 'id');
            var seedArtists = _.sampleSize(playlistArtistsId, 5);
            // Create a cookie of 5 random similar artists for playlist creation
            docCookies.setItem("seedArtists", seedArtists, maxAgeToGMT(1000));
            // Create cookies for the searched artist and obscurity value
            docCookies.setItem("artistSearch", query.search, maxAgeToGMT(1000));
            docCookies.setItem("obscuritySearch", query.obscurity, maxAgeToGMT(1000));
            console.log(docCookies.getItem("artistSearch"));
            console.log(docCookies.getItem("obscuritySearch"));
        },
    });
    }
 });
 // Create a playlist
 $('.playlist-button').click(function(e) {
     var query = {
        seedArtists: docCookies.getItem("seedArtists"),
        searchedArtist: docCookies.getItem("artistSearch"),
     };
     $('.sk-wave').show();
     $.ajax ({
         url: '/erato/playlist',
         data: query,
         success: function(playlistName) {
            $('.sk-wave').hide();
            $('#playlist-text').append('"' + playlistName + '"' + ' created! Listen on your Spotify account.');
         },
     });
 });
});

// Cookie functions
var docCookies = {
  getItem: function (sKey) {
    if (!sKey) { return null; }
    return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
  },
  setItem: function (sKey, sValue, vEnd, sPath, sDomain, bSecure) {
    if (!sKey || /^(?:expires|max\-age|path|domain|secure)$/i.test(sKey)) { return false; }
    var sExpires = "";
    if (vEnd) {
      switch (vEnd.constructor) {
        case Number:
          sExpires = vEnd === Infinity ? "; expires=Fri, 31 Dec 9999 23:59:59 GMT" : "; max-age=" + vEnd;
          break;
        case String:
          sExpires = "; expires=" + vEnd;
          break;
        case Date:
          sExpires = "; expires=" + vEnd.toUTCString();
          break;
      }
    }
    document.cookie = encodeURIComponent(sKey) + "=" + encodeURIComponent(sValue) + sExpires + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "") + (bSecure ? "; secure" : "");
    return true;
  },
  removeItem: function (sKey, sPath, sDomain) {
    if (!this.hasItem(sKey)) { return false; }
    document.cookie = encodeURIComponent(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT" + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "");
    return true;
  },
  hasItem: function (sKey) {
    if (!sKey || /^(?:expires|max\-age|path|domain|secure)$/i.test(sKey)) { return false; }
    return (new RegExp("(?:^|;\\s*)" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=")).test(document.cookie);
  },
  keys: function () {
    var aKeys = document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g, "").split(/\s*(?:\=[^;]*)?;\s*/);
    for (var nLen = aKeys.length, nIdx = 0; nIdx < nLen; nIdx++) { aKeys[nIdx] = decodeURIComponent(aKeys[nIdx]); }
    return aKeys;
  }
};

function maxAgeToGMT (nMaxAge) {
  return nMaxAge === Infinity ? "Fri, 31 Dec 9999 23:59:59 GMT" : (new Date(nMaxAge * 1e3 + Date.now())).toUTCString();
}
