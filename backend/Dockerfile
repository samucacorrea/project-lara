FROM php:8.2-apache

RUN apt-get update && apt-get install -y \
    libzip-dev \
    unzip \
    && docker-php-ext-install pdo pdo_mysql mysqli zip

COPY apache-vhost.conf /etc/apache2/sites-available/000-default.conf

RUN a2enmod rewrite

COPY . /var/www/html

RUN mkdir -p /var/www/html/public/uploads/avatars \
    && chown -R www-data:www-data /var/www/html/public/uploads \
    && chmod -R 775 /var/www/html/public/uploads

WORKDIR /var/www/html

EXPOSE 80