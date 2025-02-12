FROM bosagora/node:18.20-ubuntu-20.04

WORKDIR /app/

ADD . /app/
COPY ./env/.env.sample /app/env/.env

RUN yarn install --pure-lockfile
RUN yarn run build

ENTRYPOINT [ "/app/docker/entrypoint.sh" ]
