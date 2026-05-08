FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ARG VITE_BACKEND_URL
ARG VITE_APP_URL
ARG VITE_DEBUG_MODE

ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_DEBUG_MODE=$VITE_DEBUG_MODE

RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80