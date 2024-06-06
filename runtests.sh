#!/bin/sh

purple=$(tput setaf 140)
green=$(tput setaf 2)
normal=$(tput sgr0)

status() {
    printf "\n=====================================================\n"
    printf "%s\n" "$green $1 $normal"
    printf $purple -- $normal "-----------------------------------------------------\n"
}

status 'Initial GET photo should fail with 404'
curl http://localhost:8000/photos/12345678901234567890

status 'POST photo with valid fields should succeed'
curl -X POST -F "photo=@spunch.png" -F "businessId=123456789012345678901234" -F "caption=hi" localhost:8000/photos

status 'POST photo with invalid image should fail'
curl -X POST -F "photo=@spunch1.png" -F "businessId=00000000" -F "caption2=hi" localhost:8000/photos

status 'POST photo with missing/incorrect fields should fail'
curl -X POST -F "photo=@spunch.png" -F "caption2=hi" localhost:8000/photos