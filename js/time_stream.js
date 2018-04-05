var addTimer = function(){
    var list = [],
      interval;
      
    return function(id,timeStamp){
      if(!interval){
        interval = setInterval(go,1);
      }
      list.push({ele:document.getElementById(id),time:timeStamp});
    }
    
    function go() { 
      for (var i = 0; i < list.length; i++) { 
        list[i].ele.innerHTML = changeTimeStamp(list[i].time); 
        if (!list[i].time) 
          list.splice(i--, 1); 
      } 
    }

    //传入unix时间戳，得到倒计时
    function changeTimeStamp(timeStamp){
      var distancetime = new Date(timeStamp).getTime() - new Date().getTime();
      if(distancetime > 0){ 
        // var ms = Math.floor(distancetime%1000);
        // var sec = Math.floor(distancetime/1000%60);
        // var min = Math.floor(distancetime/1000/60%60);
        // var hour =Math.floor(distancetime/1000/60/60%24);
        
        // if(ms<100){
        //   ms = "0"+ ms;
        // }
        // if(sec<10){
        //   sec = "0"+ sec;
        // }
        // if(min<10){
        //   min = "0"+ min;
        // }
        // if(hour<10){
        //   hour = "0"+ hour;
        // }
        
        // return hour + ":" +min + ":" +sec + ":" +ms;
        return Math.floor(distancetime/1000)
      }else{
        return "Life is end!"
      }  
    }        
  }();
  var endDate = new Date('2069-7-15 10:00:00:000');
  addTimer("aloha", endDate.getTime());