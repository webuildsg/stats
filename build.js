var fs = require('fs');

var path = "data/";

var json = {"files": []};

fs.readdir(path, function(err, items) {
    items.forEach( (item) => {
    	var found = item.match(/audio\.live\.webuild\.sg-(\w*)-(\w*)/);
    	if (found){
    		fileDate = new Date(found[1] + ' ' + found[2])
    		json.files.push({"name": item, "date": fileDate})
    	}
    })
    json.files.sort(function(a,b){
    	return a.date - b.date;
    })
    console.log(JSON.stringify(json))
});


