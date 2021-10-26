##### Example 1

Input dataframe my_df:
                  
                  make fuel_type aspiration
    0      alfa-romero       gas        std
    1      alfa-romero       gas        std
    2             audi       gas        std
    3              bmw       gas        std
    ...

We use the 3 followings series to compute our cross tabulation.

    my_df["make"]
    my_df["fuel_type"]
    my_df["aspiration"]

Output freqs:
    
    fuel_type      diesel         gas       
    aspiration        std  turbo  std  turbo
    make                                    
    alfa-romero         0      0    3      0
    audi                0      0    5      1
    honda               0      0   13      0
    mazda               2      0   15      0
    ...

##### Example 2

One can also use a different aggregation function on another series and/or add subtotals margin.

Input dataframe my_df:

                  make fuel_type aspiration horsepower
    0      alfa-romero       gas        std        111
    1             audi       gas        std        102
    2             audi       gas        std        115
    3              bmw       gas        std        101
    ...

Output stats:

    fuel_type     diesel        gas        All
    aspiration       std turbo  std turbo     
    make                                      
    alfa-romero                 154        154
    audi                        115   140  140
    mazda             72         84         84
    mercedes-benz          123  184        184
    dodge                        88   145   88
    jaguar                      262        262
    ...
    All               72   123  262   145  262
