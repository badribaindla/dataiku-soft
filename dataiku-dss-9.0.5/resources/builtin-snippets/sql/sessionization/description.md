
Sessionization boils down to combining discrete events into sessions, a unit of measurement widely used when dealing with time series data.

Sessions are sets of consecutives events which are separated by a minimum elapse of time. 

The inner query creates a column with value 1 whenever a new session is started.
The outer query creates the ID for each session and user.
The minimum elapse time separating session is 30 mins (30 * 60 seconds).
