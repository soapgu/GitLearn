#!/bin/sh
echo 'begin get patch id'
set x `git diff-tree e9de478b6844242b83e0a770028434ba55446cc5 -p | git patch-id`
echo "$1"
echo "$2"
echo "$3"
echo "sh is end..."