#!/bin/bash

echo -n "{\"files\":["; for file in data/audio*; do echo "{\"name\":\"${file##*/}\"},"; done | sed '$ s/.$/]/'; echo "}"
