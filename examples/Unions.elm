type FF = T1 | T2 Int String | T3 String | T4 { a: Int, b: String }

type FFI = TI1 | TI2 Int | TI3 String | TI4 FFI

a =
    T1

b =
    T2 2 "a"

c =
    T3 "f"

a

b

c

d =
    TI4 (TI3 "c")

d

e =
    T4 { a = 3, b = "x" }

e

toString d
