FROM alpine:latest
RUN apk add --no-cache python py-pip && pip install awscli requests boto3
COPY forwarder.py .
ENTRYPOINT ["python", "forwarder.py"]
