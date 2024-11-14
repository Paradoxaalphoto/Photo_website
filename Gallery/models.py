from django.db import models

class Photo(models.Model):
    title = models.CharField(max_length=100)
    description = models.TextField()
    image = models.ImageField(upload_to='gallery/')  # Make sure upload_to is set to a valid directory
