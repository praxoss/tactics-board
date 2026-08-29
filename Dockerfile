FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html app.js styles.css setpiece-data.js badge-logo.png /usr/share/nginx/html/

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
