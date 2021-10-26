##### Example

Suppose we work we the following dataframe :

         name drug heartrate
    1  Wilbur    a        67
    2 Petunia    a        80
    3 Gregory    a        64
    4  Wilbur    b        56
    5 Petunia    b        90
    6 Gregory    b        50

Drug is the key column and heartbeat is the value column :

    df %>% spread(drug, heartrate)

         name  a  b
    1  Wilbur 67 56
    2 Petunia 80 90
    3 Gregory 64 50





