#!/bin/zsh

cd ~/Downloads/mongo || exit

for f in *.json; do
  collection="${f%.json}"
  echo "Importing $collection..."
  mongoimport \
    --uri="mongodb://mongo:mongo@localhost:27017/radio_mongo?authSource=admin" \
    --collection="$collection" \
    --file="$f" \
    --jsonArray
done