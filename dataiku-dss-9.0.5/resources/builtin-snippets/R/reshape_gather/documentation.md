##### Example

         name  a  b
    1  Wilbur 67 56
    2 Petunia 80 90
    3 Gregory 64 50

We have three variables (name, drug and heartrate), but only name is currently in a column. We use gather() to gather the a and b columns into key-value pairs of drug and heartrate:

    df %>% gather(drug, heartrate, a, b)

         name drug heartrate
    1  Wilbur    a        67
    2 Petunia    a        80
    3 Gregory    a        64
    4  Wilbur    b        56
    5 Petunia    b        90
    6 Gregory    b        50