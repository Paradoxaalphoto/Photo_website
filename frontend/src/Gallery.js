import React, { useEffect, useState } from 'react';
import axios from 'axios';

function Gallery() {
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:8000/api/photos/')
      .then(response => {
        setPhotos(response.data);
      })
      .catch(error => console.error('Error fetching photos:', error));
  }, []);

  return (
    <div>
      {photos.map(photo => (
        <div key={photo.id}>
          <img src={photo.image} alt={photo.title} />
          <h2>{photo.title}</h2>
          <p>{photo.description}</p>
        </div>
      ))}
    </div>
  );
}

export default Gallery;
