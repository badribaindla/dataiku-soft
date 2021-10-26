df = data.frame(x=c(1,2,3,4))

df %>% mutate(label=ifelse(x>2, "big", "small"))

df %>% mutate(y=ifelse(x<3, -x, x^2))